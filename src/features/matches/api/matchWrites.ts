import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
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
import { isMatchFull, isWaitlistFull, rosterEntryFor } from '../../../utils/matches';
import { weekBounds } from '../../../utils/weeks';
import { countCreatedActive } from './weeklyLimit';
import {
  buildCreatePayload,
  buildDetailsPatch,
  buildGuestListPatch,
  buildJoinPatch,
  buildLeavePatch,
  buildRosterMovePatch,
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
 * Needs the (creatorId, date) composite index declared in firestore.indexes.json.
 */
export async function countMyActiveMatchesInWeek(uid: string, kickoff: Date): Promise<number> {
  const { start, end } = weekBounds(kickoff);
  try {
    const snap = await getDocs(
      query(
        collection(db, MATCHES),
        where('creatorId', '==', uid),
        where('date', '>=', Timestamp.fromDate(start)),
        where('date', '<', Timestamp.fromDate(end)),
      ),
    );
    const inWeek = snap.docs.map((d) => {
      const data = d.data();
      return { ...data, id: d.id, date: (data.date as Timestamp).toDate() } as MatchData;
    });
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

/**
 * Only members can read a match, so a successful read proves the signed-in user is one. Only a
 * server `permission-denied` proves they are not; any other failure (offline, unavailable) proves
 * nothing, and guessing "not a member" would retry a duplicate onto the waitlist, so it surfaces.
 */
async function isAlreadyMember(matchId: string): Promise<boolean> {
  try {
    await getDoc(refs(matchId).matchRef);
    return true;
  } catch (error) {
    if (isRejection(error)) return false;
    handleFirestoreError(error, OperationType.GET, `matches/${matchId}`);
  }
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
  const attempt = async (from: typeof match, as: 'roster' | 'waitlist') => {
    const { matchPatch, previewPatch } = buildJoinPatch(from, member, as);
    await commitRosterChange(match.id, matchPatch, previewPatch);
  };

  try {
    await attempt(match, target);
    return 'joined';
  } catch (error) {
    if (!isRejection(error)) handleFirestoreError(error, OperationType.UPDATE, `matches/${match.id}`);
    // A rejection here usually means someone else wrote the roster first. `buildJoinPatch` rewrites
    // the arrays from a snapshot, so re-sending the stale one would drop that winner and be denied
    // again (the rules' symmetric-difference check). A member may read the match: rebuild from fresh.
    let fresh: typeof match;
    try {
      const snap = await getDoc(refs(match.id).matchRef);
      if (!snap.exists()) throw error;
      // True for the roster fields this path reads -- the id arrays, `guests`, `capacity` -- and
      // nothing else. `date` arrives as a raw Timestamp, not the Date the type promises, because
      // `toMatch`'s normalization is not in the way here. Never hand `fresh` to anything that
      // formats a date.
      fresh = { ...match, ...(snap.data() as Partial<MatchData>) };
    } catch (readError) {
      // Surface the original rejection: that is the one the user hit. But log why the re-read
      // failed too, or the console says 'permission-denied' when the real cause was something else
      // entirely (offline, for one), and the next person to debug this starts from a false lead.
      console.error('join re-read failed', readError);
      handleFirestoreError(error, OperationType.UPDATE, `matches/${match.id}`);
    }
    const as = target === 'roster' && isMatchFull(fresh) ? 'waitlist' : target;
    // Already on the list we were about to write: the first attempt landed after all, or a leave
    // promoted us while this was in flight. Re-sending is pointless at best -- and for a waitlist
    // retry it is worse, because `buildJoinPatch` only clears the OTHER array when the target is
    // 'roster'. A waitlist retry over a roster membership appends the uid WITHOUT removing it,
    // leaving them on both lists, and the rules accept that: `memberIds` is unchanged as a set, so
    // the symmetric difference is empty, the derived-count check holds, and `occupied` never moved.
    // Measured against the emulator, not reasoned about. Without these two lines the retry turns
    // the very race it exists for into a corrupt roster: the player renders twice and holds a
    // waitlist slot a real waitlister cannot have.
    if (fresh.joinedPlayerIds.includes(member.id)) return 'joined';
    if (as === 'waitlist' && (fresh.waitlistPlayerIds ?? []).includes(member.id)) return 'joined';
    if (as === 'waitlist' && isWaitlistFull(fresh)) return 'waitlist-full';
    try {
      await attempt(fresh, as);
      return 'joined';
    } catch (retryError) {
      handleFirestoreError(retryError, OperationType.UPDATE, `matches/${match.id}`);
    }
  }
}

/**
 * A waitlisted link joiner's second chance, and the only thing in the app that repairs a drifted
 * `occupiedCount`.
 *
 * Two unrelated rejections send a roster join to the waitlist, and the joiner can tell neither
 * apart, because they cannot read the match: either it really is full (`withinCapacity`), or
 * `matchPreviews.occupiedCount` no longer equals the roster the rules derive it from, so
 * `increment(1)` cannot land on the required count. The second is not a transient race — while
 * the counter is off by any amount, in either direction, EVERY link roster-join is denied and
 * every joiner is quietly held, for good, until some write sends an absolute count. Only a member
 * may read the match and the waitlist join just made this joiner one, so this is the first moment
 * the truth is available to them.
 *
 * `buildJoinPatch` sends whole arrays and an absolute `occupiedCount`, so a success both moves
 * them onto the roster (dropping the waitlist entry) and resyncs the preview for everyone after
 * them. Best-effort by design: they are already safely on the waitlist, so a genuinely full match,
 * a failed read or a lost race leaves them there rather than raising.
 */
async function claimOpenSpot(
  matchId: string,
  member: { id: string } & RosterMember,
): Promise<boolean> {
  try {
    const snap = await getDoc(refs(matchId).matchRef);
    if (!snap.exists()) return false;
    // Roster fields are all this reads. `date` arrives as the raw Timestamp, not the Date the type
    // promises, so nothing here may format it. `capacity` is defaulted the way `toMatch` and the
    // rules both default it: a backfilled legacy doc can carry memberIds and no capacity, which
    // would make `isMatchFull` always false and send a write the rules are certain to refuse.
    const data = snap.data() as Partial<MatchData>;
    const fresh = { ...data, id: matchId, capacity: data.capacity ?? 10 } as MatchData;
    if (isMatchFull(fresh)) return false;
    const { matchPatch, previewPatch } = buildJoinPatch(fresh, member, 'roster');
    await commitRosterChange(matchId, matchPatch, previewPatch);
    return true;
  } catch (error) {
    // Logged, never thrown: the waitlist place they already hold is the thing worth protecting.
    console.error('link join: could not take the open spot', error);
    return false;
  }
}

/**
 * Joining from an invitation, by someone who cannot read the match. `joinMatch` rewrites whole
 * roster arrays from a `MatchData` the caller holds; a link recipient holds none, and a guessed
 * empty one would wipe the roster (the rules reject that, correctly). So this sends only what the
 * joiner can know: `arrayUnion` of their own uid and `increment(1)` on the preview, both resolved
 * against the stored documents, never against a stale client copy.
 *
 * The preview is only bumped for a roster join; a waitlister does not change `occupiedCount`.
 * A roster join the rules refuse retries once as a waitlist join, and then `claimOpenSpot` checks
 * whether the match was actually full — the refusal alone does not prove it was, and a drifted
 * counter refuses every roster join forever. Nothing in the rules caps the waitlist, so the joiner
 * cannot learn it is full from here.
 *
 * Resolves to the list they actually landed on, so the caller can say so when a roster join was
 * downgraded to the waitlist, or to 'already-member' when the denial was a duplicate join (the same
 * link joined from two tabs). A duplicate must NOT retry: arrayUnion leaves the match unchanged
 * but increment(1) pushes the preview off the derived count, so the batch is denied; retrying as
 * waitlist then succeeds and leaves the uid on both lists. The read gate is the oracle: `get`
 * requires uid in memberIds, so a readable match means the joiner was already in.
 */
export async function joinMatchByLink(
  matchId: string,
  member: { id: string } & RosterMember,
  target: 'roster' | 'waitlist',
): Promise<'roster' | 'waitlist' | 'already-member'> {
  const attempt = async (as: 'roster' | 'waitlist') => {
    const { matchRef, previewRef } = refs(matchId);
    const batch = writeBatch(db);
    batch.update(matchRef, {
      [as === 'roster' ? 'joinedPlayerIds' : 'waitlistPlayerIds']: arrayUnion(member.id),
      memberIds: arrayUnion(member.id),
      [`roster.${member.id}`]: rosterEntryFor(member),
      updatedAt: new Date().toISOString(),
    });
    if (as === 'roster') batch.set(previewRef, { occupiedCount: increment(1) }, { merge: true });
    await batch.commit();
  };

  try {
    await attempt(target);
    return target;
  } catch (error) {
    if (target === 'roster' && isRejection(error)) {
      if (await isAlreadyMember(matchId)) return 'already-member';
      try {
        await attempt('waitlist');
      } catch (retryError) {
        handleFirestoreError(retryError, OperationType.UPDATE, `matches/${matchId}`);
      }
      return (await claimOpenSpot(matchId, member)) ? 'roster' : 'waitlist';
    }
    handleFirestoreError(error, OperationType.UPDATE, `matches/${matchId}`);
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

/** The owner taking someone off the match. Nobody is promoted: the freed spot stays open. */
export async function removeFromMatch(match: MatchData, uid: string): Promise<void> {
  const { matchPatch, previewPatch } = buildLeavePatch(match, uid, { promote: false });
  try {
    await commitRosterChange(match.id, matchPatch, previewPatch);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `matches/${match.id}`);
  }
}

/** The owner moving a member between the roster and the waitlist. Capacity is the caller's check. */
export async function moveRosterMember(
  match: MatchData,
  uid: string,
  to: 'roster' | 'waitlist',
): Promise<void> {
  const { matchPatch, previewPatch } = buildRosterMovePatch(match, uid, to);
  try {
    await commitRosterChange(match.id, matchPatch, previewPatch);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `matches/${match.id}`);
  }
}

/** The whole +1 list, after an add or a removal. */
export async function setGuestList(
  match: MatchData,
  guests: MatchGuest[],
  options?: { promote?: boolean },
): Promise<void> {
  const { matchPatch, previewPatch } = buildGuestListPatch(match, guests, options);
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
  // An empty name is "not known yet" (a guest's cleared localStorage), never a rename: writing it
  // would erase the only copy of the name left, in front of everyone in the match.
  if (!profile.name.trim()) return;
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
