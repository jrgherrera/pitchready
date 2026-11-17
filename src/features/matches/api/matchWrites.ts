import {
  collection,
  doc,
  getDocs,
  query,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type UpdateData,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../../lib/firebase';
import type { CreateMatchForm, MatchData, MatchGuest, RosterMember, UserProfile } from '../../../types';
import { isWaitlistFull, rosterEntryFor } from '../../../utils/matches';
import { weekBounds } from '../../../utils/weeks';
import { countCreatedActive } from './weeklyLimit';
import {
  buildCreatePayload,
  buildDetailsPatch,
  buildGuestListPatch,
  buildJoinPatch,
  buildLeavePatch,
  type MatchRosterPatch,
  type PreviewCountPatch,
} from './matchPayloads';

/**
 * Every write that touches a match goes through this module, and every write that changes a
 * preview field writes `matches/{id}` and `matchPreviews/{id}` in one batch. Firestore has no
 * field-level read security, so the two documents are the privacy split — and the only way to
 * keep them in step is to leave no other mutation path in the app.
 *
 * Payload shaping lives in `./matchPayloads` (pure, checked); this file is the Firestore half.
 * `saveTeams` is deliberately not here: `teams` is never a preview field.
 */

const MATCHES = 'matches';
const PREVIEWS = 'matchPreviews';

function refs(matchId: string) {
  return {
    matchRef: doc(db, MATCHES, matchId),
    previewRef: doc(db, PREVIEWS, matchId),
  };
}

/**
 * `UpdateData` cannot describe a patch that mixes plain fields with dotted `roster.<uid>` keys,
 * which is exactly what the builders produce. One cast here keeps the builders honestly typed.
 */
function asUpdate(patch: object): UpdateData<DocumentData> {
  return patch as UpdateData<DocumentData>;
}

/** A 20-char random Firestore id. Replaces `match_${Date.now()}`, guessable by enumeration. */
export function newMatchId(): string {
  return doc(collection(db, MATCHES)).id;
}

export async function createMatch(
  form: CreateMatchForm,
  profile: UserProfile,
  defaultTitle: string,
): Promise<string> {
  const matchId = newMatchId();
  const { matchPatch, previewPatch } = buildCreatePayload(matchId, form, profile, defaultTitle);
  const { matchRef, previewRef } = refs(matchId);

  const batch = writeBatch(db);
  batch.set(matchRef, matchPatch);
  batch.set(previewRef, previewPatch);

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `matches/${matchId}`);
  }
  return matchId;
}

/**
 * Active matches `uid` created in the Monday-Sunday week of `kickoff`. A query of its own, not
 * derived from the loaded match list, whose past half is capped and would undercount.
 * Filters on `creatorId` alone and narrows the week here: equality plus a `date` range would
 * need a composite index this project does not deploy.
 */
export async function countMyActiveMatchesInWeek(uid: string, kickoff: Date): Promise<number> {
  const { start, end } = weekBounds(kickoff);
  try {
    const snap = await getDocs(query(collection(db, MATCHES), where('creatorId', '==', uid)));
    const inWeek = snap.docs
      .map((d) => {
        const data = d.data();
        // Legacy docs still hold a 'YYYY-MM-DD' string
        const date = data.date instanceof Timestamp ? data.date.toDate() : new Date(data.date);
        return { ...data, id: d.id, date } as MatchData;
      })
      .filter((m) => m.date >= start && m.date < end);
    return countCreatedActive(inWeek, uid);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, MATCHES);
  }
}

/** Only the details — roster, creator and timestamps are left alone. */
export async function updateMatchDetails(
  matchId: string,
  form: CreateMatchForm,
  defaultTitle: string,
): Promise<void> {
  const { matchPatch, previewPatch } = buildDetailsPatch(form, defaultTitle);
  const { matchRef, previewRef } = refs(matchId);

  const batch = writeBatch(db);
  batch.update(matchRef, asUpdate(matchPatch));
  // Merged, not updated: a match created before the preview split has no preview document yet
  batch.set(previewRef, previewPatch, { merge: true });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `matches/${matchId}`);
  }
}

export async function deleteMatchEverywhere(matchId: string): Promise<void> {
  const { matchRef, previewRef } = refs(matchId);

  const batch = writeBatch(db);
  batch.delete(matchRef);
  batch.delete(previewRef);

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `matches/${matchId}`);
  }
}

async function commitRosterChange(
  matchId: string,
  matchPatch: MatchRosterPatch,
  previewPatch: PreviewCountPatch,
): Promise<void> {
  const { matchRef, previewRef } = refs(matchId);
  const batch = writeBatch(db);
  batch.update(matchRef, asUpdate(matchPatch));
  batch.set(previewRef, previewPatch, { merge: true });
  await batch.commit();
}

function isRejection(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'permission-denied';
}

/**
 * Joining, decided blind: a joiner cannot read the match, only the preview's `occupiedCount`,
 * which may be stale by the time it commits. When two people take the last spot at once the
 * rules reject the loser — so a rejected roster join retries once as a waitlist join rather
 * than surfacing an error.
 *
 * Returns `'waitlist-full'` when the fallback has nowhere to put them: that is a message for the
 * user, not a Firestore error, and the caller owns the wording.
 */
export async function joinMatch(
  match: MatchData,
  member: { id: string } & RosterMember,
  target: 'roster' | 'waitlist',
): Promise<'joined' | 'waitlist-full'> {
  const attempt = async (as: 'roster' | 'waitlist') => {
    const { matchPatch, previewPatch } = buildJoinPatch(match, member, as);
    await commitRosterChange(match.id, matchPatch, previewPatch);
  };

  try {
    await attempt(target);
    return 'joined';
  } catch (error) {
    if (target === 'roster' && isRejection(error)) {
      // The same guard the caller applies when it picks 'waitlist' itself. The count is as stale
      // as everything else the joiner can see, but it is the best available and beats a raw error.
      if (isWaitlistFull(match)) return 'waitlist-full';
      try {
        await attempt('waitlist');
        return 'joined';
      } catch (retryError) {
        handleFirestoreError(retryError, OperationType.UPDATE, `matches/${match.id}`);
      }
    }
    handleFirestoreError(error, OperationType.UPDATE, `matches/${match.id}`);
  }
}

/** Leaving the roster or the waitlist. A roster leave promotes the next waitlister. */
export async function leaveMatch(match: MatchData, uid: string): Promise<void> {
  const { matchPatch, previewPatch } = buildLeavePatch(match, uid);
  try {
    await commitRosterChange(match.id, matchPatch, previewPatch);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `matches/${match.id}`);
  }
}

/** The whole +1 list, after an add or a removal. */
export async function setGuestList(match: MatchData, guests: MatchGuest[]): Promise<void> {
  const { matchPatch, previewPatch } = buildGuestListPatch(match, guests);
  try {
    await commitRosterChange(match.id, matchPatch, previewPatch);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `matches/${match.id}`);
  }
}

/**
 * Keeps the caller's own roster snapshot current after they rename or change their photo.
 * No preview field moves, so no batch — and only `roster.<uid>`, never the whole map.
 */
export async function refreshOwnRosterEntry(
  match: MatchData,
  profile: UserProfile,
): Promise<void> {
  const entry = rosterEntryFor(profile);
  const current = match.roster?.[profile.id];
  if (
    current &&
    current.name === entry.name &&
    current.role === entry.role &&
    current.photoURL === entry.photoURL
  ) {
    return;
  }

  try {
    await updateDoc(doc(db, MATCHES, match.id), {
      [`roster.${profile.id}`]: entry,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `matches/${match.id}`);
  }
}
