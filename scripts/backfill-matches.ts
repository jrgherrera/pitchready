/**
 * One-off backfill for matches created before matches became private by membership.
 * Run once per environment, as the super admin (the rules grant them every match):
 *
 *   BACKFILL_PASSWORD=... npx tsx scripts/backfill-matches.ts
 *
 * Reads the Firebase web config from .env (same VITE_* keys the app uses); BACKFILL_EMAIL
 * defaults to the super admin. Idempotent: a match that needs nothing is reported as skipped.
 *
 * Per match it fills what is missing: memberIds (computeMemberIds), creatorName and roster
 * (from users/{id}, which is being deleted), converts a legacy 'YYYY-MM-DD' string date to a
 * Timestamp at local midnight, and writes matchPreviews/{id} (toPreview). Match and preview go
 * in one batch.
 *
 * Old ids (`match_<timestamp>`) are NOT migrated: a document id cannot change in place, and
 * recreating would break saved links and reset rosters. Those matches keep guessable links and
 * age out as they become past matches. Matches created from Task 3 on have unguessable ids.
 */
import 'dotenv/config';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  Timestamp,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import { pathToFileURL } from 'node:url';
import type { MatchData, RosterMember, UserProfile } from '../src/types';
import { computeMemberIds, rosterEntryFor, SUPER_ADMIN_EMAIL } from '../src/utils/matches';
import { toPreview } from '../src/utils/matchPreview';

type Names = Record<string, Pick<UserProfile, 'id' | 'name' | 'role' | 'photoURL'>>;

/** 'YYYY-MM-DD' -> local midnight of that day; null if it is not that shape. */
export function parseLegacyDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1 ? d : null; // rejects 2026-02-31
}

/**
 * Pure: what to write to matches/{id}, and the preview to write beside it.
 * `users` holds the profiles of the creator and everyone in the arrays (missing = deleted).
 */
export function planBackfill(id: string, data: DocumentData, users: Names) {
  const warnings: string[] = [];
  const patch: DocumentData = {};

  let date: Date | null = null;
  let dateConverted = false;
  if (data.date instanceof Timestamp) {
    date = data.date.toDate();
  } else {
    date = typeof data.date === 'string' ? parseLegacyDate(data.date) : null;
    if (date) {
      patch.date = Timestamp.fromDate(date);
      dateConverted = true;
    } else {
      warnings.push(`unparseable date ${JSON.stringify(data.date)}; left as is, no preview written`);
    }
  }

  const joined: string[] = data.joinedPlayerIds ?? [];
  const waitlist: string[] = data.waitlistPlayerIds ?? [];
  const memberIds = computeMemberIds({ creatorId: data.creatorId, joinedPlayerIds: joined, waitlistPlayerIds: waitlist });
  const have: string[] | undefined = data.memberIds;
  // Missing or wrong: the rules derive memberIds from the arrays, so a mismatch blocks joins too.
  if (!have || have.length !== memberIds.length || memberIds.some((x, i) => have[i] !== x)) {
    patch.memberIds = memberIds;
  }

  let creatorName: string | undefined = data.creatorName;
  if (creatorName === undefined) {
    creatorName = users[data.creatorId]?.name;
    if (creatorName) patch.creatorName = creatorName;
    else warnings.push(`creator ${data.creatorId} has no users doc; creatorName left empty`);
  }

  const roster: Record<string, RosterMember> = { ...(data.roster ?? {}) };
  let rosterAdded = 0;
  for (const uid of [...joined, ...waitlist]) {
    if (roster[uid]) continue;
    const u = users[uid];
    if (!u) {
      warnings.push(`player ${uid} has no users doc; no roster entry`);
      continue;
    }
    roster[uid] = rosterEntryFor(u);
    rosterAdded++;
  }
  if (rosterAdded > 0) patch.roster = roster;

  const preview = date ? toPreview({ ...data, id, date, memberIds, creatorName, roster } as MatchData) : null;
  return { patch, preview, dateConverted, warnings };
}

async function main() {
  const env = process.env;
  const password = env.BACKFILL_PASSWORD;
  if (!password) throw new Error('Set BACKFILL_PASSWORD (password of the super admin account).');
  const app = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  });
  const dbId = env.VITE_FIREBASE_FIRESTORE_DATABASE_ID;
  const db = dbId && dbId !== '(default)' ? initializeFirestore(app, {}, dbId) : initializeFirestore(app, {});
  await signInWithEmailAndPassword(getAuth(app), env.BACKFILL_EMAIL ?? SUPER_ADMIN_EMAIL, password);

  const userCache = new Map<string, Names[string] | null>();
  async function loadUser(uid: string) {
    if (!userCache.has(uid)) {
      const s = await getDoc(doc(db, 'users', uid));
      userCache.set(uid, s.exists() ? ({ id: uid, ...s.data() } as Names[string]) : null);
    }
    return userCache.get(uid)!;
  }

  const snap = await getDocs(collection(db, 'matches'));
  let filled = 0, skipped = 0, failed = 0, dates = 0, warned = 0;

  for (const d of snap.docs) {
    const data = d.data();
    try {
      const users: Names = {};
      const ids = [data.creatorId, ...(data.joinedPlayerIds ?? []), ...(data.waitlistPlayerIds ?? [])];
      for (const uid of new Set<string>(ids)) {
        const u = typeof uid === 'string' ? await loadUser(uid) : null;
        if (u) users[uid] = u;
      }
      const plan = planBackfill(d.id, data, users);
      const previewRef = doc(db, 'matchPreviews', d.id);
      const previewExists = (await getDoc(previewRef)).exists();
      const warn = plan.warnings.map((w) => `\n    warning: ${w}`).join('');
      warned += plan.warnings.length;

      // Skip only when every field this script writes is already right, preview included.
      // memberIds alone is not enough: a doc can have it yet still hold a string date or no preview.
      const patchKeys = Object.keys(plan.patch);
      const needsPreview = plan.preview !== null && !previewExists;
      if (patchKeys.length === 0 && !needsPreview) {
        skipped++;
        console.log(`skipped ${d.id}: already backfilled${warn}`);
        continue;
      }
      const batch = writeBatch(db);
      if (patchKeys.length > 0) batch.update(d.ref, plan.patch);
      if (plan.preview) batch.set(previewRef, plan.preview);
      await batch.commit();
      filled++;
      if (plan.dateConverted) dates++;
      const what = [...patchKeys, plan.preview ? 'preview' : 'NO preview'];
      console.log(`filled  ${d.id}: ${what.join(', ')}${warn}`);
    } catch (e) {
      failed++;
      console.log(`FAILED  ${d.id}: ${(e as Error).message}`);
    }
  }

  console.log(
    `\n${snap.size} matches: ${filled} filled, ${skipped} skipped, ${failed} failed; ` +
      `${dates} string dates converted, ${warned} warnings.` +
      (filled === 0 && failed === 0 ? ' Nothing to do (already backfilled).' : ''),
  );
  process.exit(failed > 0 ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
