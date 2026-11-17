import {
  collection,
  doc,
  updateDoc,
  writeBatch,
  type DocumentData,
  type UpdateData,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../../lib/firebase';
import type { CreateMatchForm, MatchData, MatchGuest, RosterMember, UserProfile } from '../../../types';
import { rosterEntryFor } from '../../../utils/matches';
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
 */
export async function joinMatch(
  match: MatchData,
  member: { id: string } & RosterMember,
  target: 'roster' | 'waitlist',
): Promise<void> {
  const attempt = async (as: 'roster' | 'waitlist') => {
    const { matchPatch, previewPatch } = buildJoinPatch(match, member, as);
    await commitRosterChange(match.id, matchPatch, previewPatch);
  };

  try {
    await attempt(target);
  } catch (error) {
    if (target === 'roster' && isRejection(error)) {
      try {
        await attempt('waitlist');
        return;
      } catch (retryError) {
        handleFirestoreError(retryError, OperationType.UPDATE, `matches/${match.id}`);
        return;
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
