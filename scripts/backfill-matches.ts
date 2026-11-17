/**
 * One-off backfill for matches created before matches became private by membership.
 * Run once per environment with the Firebase Admin SDK, which authenticates with a service-account
 * key and bypasses the Firestore rules:
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/sa-key.json npx tsx scripts/backfill-matches.ts
 *
 * The key comes from Firebase console > Project settings > Service accounts > Generate new private
 * key (keep it out of git; sa-key.json and *-key.json are ignored). VITE_FIREBASE_FIRESTORE_DATABASE_ID
 * in .env selects a non-default database. Idempotent: a match that needs nothing is reported as skipped.
 *
 * Rules do not apply here, so memberIds must always come from computeMemberIds: a document whose
 * memberIds disagrees with its arrays would be rejected on every later client write.
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
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, type DocumentData } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import type { MatchData, MatchPreview, RosterMember, UserProfile } from '../src/types';
import { computeMemberIds, rosterEntryFor } from '../src/utils/matches';
import { toPreview } from '../src/utils/matchPreview';

type Names = Record<string, Pick<UserProfile, 'id' | 'name' | 'role' | 'photoURL'>>;

/**
 * Legacy string date -> Date, or null if unreadable. A date-only 'YYYY-MM-DD' becomes local midnight
 * (strictly, so 2026-02-31 is rejected rather than rolled over). Anything else gets what the app
 * itself accepts (useMyMatches does `new Date(s)`), e.g. an ISO string with a time.
 */
export function parseLegacyDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.getMonth() === Number(m[2]) - 1 ? d : null;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Firestore value -> comparable plain value (Timestamps and Dates become epoch ms). */
function norm(v: unknown): unknown {
  if (v instanceof Timestamp) return v.toMillis();
  if (v instanceof Date) return v.getTime();
  if (Array.isArray(v)) return v.map(norm);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, norm(x)]));
  }
  return v;
}

/** True when a stored preview is absent or differs from the expected one in any field (extra keys included). */
export function previewDiffers(existing: DocumentData | undefined, expected: MatchPreview): boolean {
  return !existing || !isDeepStrictEqual(norm(existing), norm(expected));
}

/**
 * Pure: what to write to matches/{id}, and the preview to write beside it.
 * `users` holds the profiles of the creator and everyone in the arrays (missing = deleted).
 */
export function planBackfill(id: string, data: DocumentData, users: Names) {
  // `unresolved`: things this script cannot fix. The match must never be reported as done.
  const unresolved: string[] = [];
  const patch: DocumentData = {};

  if (typeof data.creatorId !== 'string' || !data.creatorId) {
    return { patch, preview: null, dateConverted: false, unresolved: ['no creatorId; fix the document by hand'] };
  }

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
      unresolved.push(`unreadable date ${JSON.stringify(data.date)}; left as is, invisible to date queries, no preview`);
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
    else unresolved.push(`creator ${data.creatorId} has no users doc; creatorName not written`);
  }

  const roster: Record<string, RosterMember> = { ...(data.roster ?? {}) };
  let rosterAdded = 0;
  for (const uid of [...joined, ...waitlist]) {
    if (roster[uid]) continue;
    const u = users[uid];
    if (!u) {
      unresolved.push(`player ${uid} has no users doc; no roster entry`);
      continue;
    }
    roster[uid] = rosterEntryFor(u);
    rosterAdded++;
  }
  if (rosterAdded > 0) patch.roster = roster;

  const preview = date ? toPreview({ ...data, id, date, memberIds, creatorName, roster } as MatchData) : null;
  return { patch, preview, dateConverted, unresolved };
}

async function main() {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyPath) throw new Error('Set GOOGLE_APPLICATION_CREDENTIALS to the path of the service-account key JSON.');
  let key;
  try {
    key = JSON.parse(readFileSync(keyPath, 'utf8'));
  } catch (e) {
    throw new Error(`Cannot read the service-account key at GOOGLE_APPLICATION_CREDENTIALS (${keyPath}): ${(e as Error).message}`);
  }
  const app = initializeApp({ credential: cert(key) });
  const dbId = process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID;
  const db = dbId && dbId !== '(default)' ? getFirestore(app, dbId) : getFirestore(app);

  const userCache = new Map<string, Names[string] | null>();
  async function loadUser(uid: string) {
    if (!userCache.has(uid)) {
      const s = await db.collection('users').doc(uid).get();
      userCache.set(uid, s.exists ? ({ id: uid, ...s.data() } as Names[string]) : null);
    }
    return userCache.get(uid)!;
  }

  const snap = await db.collection('matches').get();
  if (snap.empty) {
    // A denied or empty listing is indistinguishable from "done" otherwise; the database is not empty.
    console.error('FOUND ZERO MATCHES. Treating as an error (denied listing? wrong database?), not as a finished migration.');
    process.exit(1);
  }
  let filled = 0, skipped = 0, failed = 0, unresolved = 0, dates = 0;

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
      const previewRef = db.collection('matchPreviews').doc(d.id);
      const existingPreview = (await previewRef.get()).data();
      const detail = plan.unresolved.map((w) => '\n    - ' + w).join('');

      // Skip only when every field this script writes is already right, preview included.
      // memberIds alone is not enough, and neither is "a preview exists": a merge-written partial
      // preview (edit between rules deploy and this run) is present but incomplete.
      const patchKeys = Object.keys(plan.patch);
      const writePreview = plan.preview !== null && previewDiffers(existingPreview, plan.preview);
      if (patchKeys.length > 0 || writePreview) {
        const batch = db.batch();
        if (patchKeys.length > 0) batch.update(d.ref, plan.patch);
        if (writePreview) batch.set(previewRef, plan.preview!);
        await batch.commit();
        if (plan.dateConverted) dates++;
      }
      const what = [...patchKeys, ...(writePreview ? [existingPreview ? 'preview(rewritten)' : 'preview'] : [])].join(', ');
      if (plan.unresolved.length > 0) {
        unresolved++;
        console.log(`NEEDS ATTENTION ${d.id}: ${what ? 'wrote ' + what + ', but ' : ''}not fully backfilled${detail}`);
      } else if (what) {
        filled++;
        console.log(`filled  ${d.id}: ${what}`);
      } else {
        skipped++;
        console.log(`skipped ${d.id}: already backfilled`);
      }
    } catch (e) {
      failed++;
      console.log(`FAILED  ${d.id}: ${(e as Error).message}`);
    }
  }

  console.log(
    '\n' +
    `${snap.size} matches: ${filled} filled, ${skipped} skipped, ${unresolved} NEED ATTENTION, ${failed} failed; ` +
      `${dates} string dates converted.` +
      (filled === 0 && failed === 0 && unresolved === 0 ? ' Nothing to do (already backfilled).' : '') +
      (unresolved > 0 ? ' Matches marked NEEDS ATTENTION are NOT fixed; they will be reported again on every run.' : ''),
  );
  process.exit(failed > 0 || unresolved > 0 ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
