import { deleteField, type FieldValue } from 'firebase/firestore';
import type {
  CreateMatchForm,
  MatchData,
  MatchGuest,
  MatchLocation,
  MatchPreview,
  RosterMember,
  UserProfile,
} from '../../../types';
import { toPreview } from '../../../utils/matchPreview';
import {
  computeMemberIds,
  getOccupiedCount,
  promoteFromWaitlist,
  rosterEntryFor,
} from '../../../utils/matches';

/**
 * Payload shaping for every match write. Pure in the sense that matters here: it does no I/O and
 * holds no Firestore handle, so `matchWrites.check.ts` can run it under `tsx`. It is not free of
 * the SDK — `deleteField` above is a value from `firebase/firestore`, which loads fine in Node;
 * what cannot load there is `src/lib/firebase`, whose client reads `import.meta.env` at import
 * time. That is the line this module keeps on the right side of, and the reason it is separate
 * from `matchWrites.ts`, the only module here that talks to Firestore.
 *
 * (It does reach i18n transitively, via `utils/matches` — hence `NODE_NO_WARNINGS=1` on the check.)
 */

/**
 * A patch for the match document whose roster fields moved. Roster entries ride as dotted
 * `roster.<uid>` keys — hence the index signature — never as the whole map.
 */
export interface MatchRosterPatch {
  joinedPlayerIds: string[];
  waitlistPlayerIds: string[];
  guests: MatchGuest[];
  memberIds: string[];
  updatedAt: string;
  [dottedRosterKey: string]: unknown;
}

/** The only preview field a roster change may touch. Everything else would leak or lie. */
export interface PreviewCountPatch {
  occupiedCount: number;
}

export interface MatchDetailsPatch {
  title: string;
  date: Date;
  capacity: number;
  duration: number;
  price: number | FieldValue;
  location: MatchLocation | FieldValue;
  updatedAt: string;
}

export interface PreviewDetailsPatch {
  title: string;
  date: Date;
  capacity: number;
  duration: number;
  price: number | FieldValue;
  location: MatchLocation | FieldValue;
}

/** The fields that move together whenever the roster moves. */
function rosterFields(
  match: Pick<MatchData, 'creatorId'>,
  joinedPlayerIds: string[],
  waitlistPlayerIds: string[],
  guests: MatchGuest[],
): MatchRosterPatch {
  return {
    joinedPlayerIds,
    waitlistPlayerIds,
    guests,
    memberIds: computeMemberIds({
      creatorId: match.creatorId,
      joinedPlayerIds,
      waitlistPlayerIds,
    }),
    updatedAt: new Date().toISOString(),
  };
}

function occupied(joinedPlayerIds: string[], guests: MatchGuest[]): PreviewCountPatch {
  return { occupiedCount: getOccupiedCount({ joinedPlayerIds, guests }) };
}

export function buildCreatePayload(
  id: string,
  form: CreateMatchForm,
  profile: UserProfile,
  defaultTitle: string,
): { matchPatch: MatchData; previewPatch: MatchPreview } {
  const day = form.date || new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();

  const matchPatch: MatchData = {
    id,
    title: form.title || defaultTitle,
    // Local kick-off instant; Firestore stores a Date as a Timestamp
    date: new Date(`${day}T${form.time || '19:00'}`),
    capacity: Math.max(2, Number(form.capacity) || 10),
    duration: Number(form.duration),
    status: 'needs_players',
    joinedPlayerIds: [profile.id],
    waitlistPlayerIds: [],
    guests: [],
    creatorId: profile.id,
    creatorName: profile.name,
    // The creator writes the whole map once, at birth; everyone after writes only their own key
    roster: { [profile.id]: rosterEntryFor(profile) },
    memberIds: computeMemberIds({
      creatorId: profile.id,
      joinedPlayerIds: [profile.id],
      waitlistPlayerIds: [],
    }),
    createdAt: now,
    updatedAt: now,
    // Both optional — omit rather than write null, the host can add them later
    ...(form.location ? { location: form.location } : {}),
    ...(form.price === '' ? {} : { price: Number(form.price) }),
  };

  return { matchPatch, previewPatch: toPreview(matchPatch) };
}

/** Only the details — roster, creator and timestamps are left alone. */
export function buildDetailsPatch(
  form: CreateMatchForm,
  defaultTitle: string,
): { matchPatch: MatchDetailsPatch; previewPatch: PreviewDetailsPatch } {
  const day = form.date || new Date().toISOString().split('T')[0];
  const details = {
    title: form.title || defaultTitle,
    date: new Date(`${day}T${form.time || '19:00'}`),
    capacity: Math.max(2, Number(form.capacity) || 10),
    duration: Number(form.duration),
    // Cleared fields are removed outright. A legacy string location reaches the form as
    // null (the picker can't show it), so saving an edit drops it — pick one to replace it.
    price: form.price === '' ? deleteField() : Number(form.price),
    location: form.location ?? deleteField(),
  };

  return {
    matchPatch: { ...details, updatedAt: new Date().toISOString() },
    previewPatch: details,
  };
}

/**
 * Joining. The caller may be blind — it decides `target` from a preview count that can be
 * stale — so this never asserts capacity; the rules do, and `joinMatch` retries as waitlist.
 */
export function buildJoinPatch(
  match: Pick<MatchData, 'creatorId' | 'joinedPlayerIds' | 'waitlistPlayerIds' | 'guests'>,
  member: { id: string } & RosterMember,
  target: 'roster' | 'waitlist',
): { matchPatch: MatchRosterPatch; previewPatch: PreviewCountPatch } {
  const joined = [...match.joinedPlayerIds];
  let waitlist = [...(match.waitlistPlayerIds ?? [])];
  const guests = [...(match.guests ?? [])];

  if (target === 'roster') {
    if (!joined.includes(member.id)) joined.push(member.id);
    waitlist = waitlist.filter((id) => id !== member.id);
  } else if (!waitlist.includes(member.id)) {
    waitlist.push(member.id);
  }

  return {
    matchPatch: {
      ...rosterFields(match, joined, waitlist, guests),
      [`roster.${member.id}`]: rosterEntryFor(member),
    },
    previewPatch: occupied(joined, guests),
  };
}

/**
 * Leaving, from the roster or from the waitlist. A roster leave also drops the +1 that player
 * brought and promotes the next waitlister into the freed spot; a waitlist leave does neither.
 * The leaver keeps their `roster` entry — it is a display snapshot, and clearing someone else's
 * key is not a write the rules will allow anyway.
 */
export function buildLeavePatch(
  match: Pick<
    MatchData,
    'creatorId' | 'joinedPlayerIds' | 'waitlistPlayerIds' | 'guests' | 'capacity'
  >,
  uid: string,
): { matchPatch: MatchRosterPatch; previewPatch: PreviewCountPatch } {
  const wasOnRoster = match.joinedPlayerIds.includes(uid);
  let joined = match.joinedPlayerIds.filter((id) => id !== uid);
  let waitlist = (match.waitlistPlayerIds ?? []).filter((id) => id !== uid);
  let guests = [...(match.guests ?? [])];

  if (wasOnRoster) {
    guests = guests.filter((g) => g.addedBy !== uid);
    const promoted = promoteFromWaitlist(joined, waitlist, guests, match.capacity);
    joined = promoted.joinedPlayerIds;
    waitlist = promoted.waitlistPlayerIds;
  }

  return {
    matchPatch: rosterFields(match, joined, waitlist, guests),
    previewPatch: occupied(joined, guests),
  };
}

/**
 * A changed +1 list.
 *
 * Only a removal reconciles the waitlist. An add passes the roster arrays through untouched, even
 * when the match has free spots and people waiting: promoting someone because a *different*
 * member brought a guest is not a behavior anything asks for, and it is reachable — capacity 12,
 * 9 joined, 3 waiting, one member clicks +1 and two strangers land on the roster. Whether free
 * spots should auto-promote at all is a product question, and raising `capacity` through
 * `buildDetailsPatch` does not promote either, so this path does not get to decide it alone.
 */
export function buildGuestListPatch(
  match: Pick<
    MatchData,
    'creatorId' | 'joinedPlayerIds' | 'waitlistPlayerIds' | 'capacity' | 'guests'
  >,
  guests: MatchGuest[],
): { matchPatch: MatchRosterPatch; previewPatch: PreviewCountPatch } {
  const freedASpot = guests.length < (match.guests ?? []).length;

  const { joinedPlayerIds, waitlistPlayerIds } = freedASpot
    ? promoteFromWaitlist(
        match.joinedPlayerIds,
        match.waitlistPlayerIds ?? [],
        guests,
        match.capacity,
      )
    : {
        joinedPlayerIds: match.joinedPlayerIds,
        waitlistPlayerIds: match.waitlistPlayerIds ?? [],
      };

  return {
    matchPatch: rosterFields(match, joinedPlayerIds, waitlistPlayerIds, guests),
    previewPatch: occupied(joinedPlayerIds, guests),
  };
}
