import { t } from '../i18n';
import type { CreateMatchForm, MatchData, MatchGuest, PlayerRole, RosterMember, UserProfile } from '../types';
import { toDateTimeInputs } from './dates';

/** Extra hold / waitlist spots beyond match capacity */
export const WAITLIST_SLOTS = 4;

/** Past matches shown in the list */
export const PAST_MATCH_LIMIT = 10;

/** Can edit or delete any match — mirrored in firestore.rules, keep both in sync */
export const SUPER_ADMIN_EMAIL = 'jrgherrera@gmail.com';

const SUPER_ADMIN_MODE_KEY = 'pitchready.superAdminMode';

export function isSuperAdmin(profile: UserProfile) {
  return profile.email === SUPER_ADMIN_EMAIL;
}

/** Super-admin powers are on unless explicitly switched off. Local preference only. */
export function getStoredSuperAdminMode() {
  return localStorage.getItem(SUPER_ADMIN_MODE_KEY) !== 'off';
}

export function storeSuperAdminMode(enabled: boolean) {
  localStorage.setItem(SUPER_ADMIN_MODE_KEY, enabled ? 'on' : 'off');
}

/**
 * Editing a match (details, deletion) is the creator's and the super admin's alone.
 * `superAdminMode` is a local view preference — firestore.rules still grants the
 * super admin write access regardless.
 */
export function canManageMatch(
  match: MatchData,
  profile: UserProfile,
  superAdminMode: boolean,
) {
  return match.creatorId === profile.id || (superAdminMode && isSuperAdmin(profile));
}

/** Existing match back into the create/edit form shape. */
export function matchToForm(match: MatchData): CreateMatchForm {
  const { day, time } = toDateTimeInputs(match.date);
  return {
    title: match.title,
    // Legacy string locations have no coords to re-pin; the save path leaves them untouched
    location: typeof match.location === 'object' ? match.location : null,
    date: day,
    time,
    capacity: match.capacity,
    duration: match.duration ?? 60,
    price: match.price ?? '',
  };
}

export type RosterEntry =
  | {
      kind: 'player';
      id: string;
      name: string;
      role?: PlayerRole;
      photoURL?: string;
      photoUserId: string;
    }
  | {
      kind: 'guest';
      id: string;
      name: string;
      addedBy: string;
      photoURL?: string;
      photoUserId: string;
      role?: PlayerRole;
    }
  | {
      kind: 'waitlist';
      id: string;
      name: string;
      role?: PlayerRole;
      photoURL?: string;
      photoUserId: string;
    };

/** Creator first, then joined, then waitlist, de-duplicated. Drives who can read a match. */
export function computeMemberIds(
  match: Pick<MatchData, 'creatorId' | 'joinedPlayerIds' | 'waitlistPlayerIds'>,
): string[] {
  return [...new Set([match.creatorId, ...match.joinedPlayerIds, ...(match.waitlistPlayerIds ?? [])])];
}

/** Roster snapshot of a profile; absent optionals are omitted because Firestore rejects undefined. */
export function rosterEntryFor(
  profile: Pick<UserProfile, 'id' | 'name' | 'role' | 'photoURL'>,
): RosterMember {
  return {
    name: profile.name,
    ...(profile.role && { role: profile.role }),
    ...(profile.photoURL && { photoURL: profile.photoURL }),
  };
}

/**
 * Roster players plus their +1s — the one definition of occupancy. `Pick` rather than `MatchData`
 * so a payload builder holding only the next arrays can use it too; `occupiedCount` is the single
 * number link-holders see, and it must not be computed two ways.
 */
export function getOccupiedCount(match: Pick<MatchData, 'joinedPlayerIds' | 'guests'>) {
  return match.joinedPlayerIds.length + (match.guests?.length ?? 0);
}

export function getWaitlistCount(match: MatchData) {
  return match.waitlistPlayerIds?.length ?? 0;
}

export function getWaitlistSpotsLeft(match: MatchData) {
  return WAITLIST_SLOTS - getWaitlistCount(match);
}

export function countLiveMatches(matches: MatchData[]) {
  return matches.filter(
    (m) => m.status === 'needs_players' || m.status === 'confirmed',
  ).length;
}

export function isMatchFull(match: MatchData) {
  return getOccupiedCount(match) >= match.capacity;
}

export function isWaitlistFull(match: MatchData) {
  return getWaitlistCount(match) >= WAITLIST_SLOTS;
}

export function getCapacityPercent(match: MatchData) {
  return Math.min(100, (getOccupiedCount(match) / match.capacity) * 100);
}

export function getSpotsLeft(match: MatchData) {
  return match.capacity - getOccupiedCount(match);
}

/**
 * After roster space opens, move waitlist players onto the main roster (FIFO)
 * until capacity is filled or the waitlist is empty.
 */
export function promoteFromWaitlist(
  joinedPlayerIds: string[],
  waitlistPlayerIds: string[],
  guests: MatchGuest[],
  capacity: number,
): { joinedPlayerIds: string[]; waitlistPlayerIds: string[] } {
  const joined = [...joinedPlayerIds];
  const waitlist = [...waitlistPlayerIds];

  while (waitlist.length > 0) {
    const occupiedNow = joined.length + guests.length;
    if (occupiedNow >= capacity) break;

    const next = waitlist.shift();
    if (!next) break;
    if (!joined.includes(next)) joined.push(next);
  }

  return { joinedPlayerIds: joined, waitlistPlayerIds: waitlist };
}

export function resolveRoster(match: MatchData): RosterEntry[] {
  const players: RosterEntry[] = match.joinedPlayerIds.map((id) => {
    const found = match.roster?.[id];
    return {
      kind: 'player' as const,
      id,
      name: found?.name || t('matches.guestPlayer'),
      role: found?.role || ('Striker' as const),
      photoURL: found?.photoURL,
      photoUserId: id,
    };
  });

  const guests: RosterEntry[] = (match.guests ?? []).map((guest: MatchGuest) => ({
    kind: 'guest' as const,
    id: guest.id,
    name: guest.name?.trim() || t('matches.guest'),
    addedBy: guest.addedBy,
    photoURL: match.roster?.[guest.addedBy]?.photoURL,
    photoUserId: guest.addedBy,
    role: 'Striker' as const,
  }));

  return [...players, ...guests];
}

export function resolveWaitlist(match: MatchData): Extract<RosterEntry, { kind: 'waitlist' }>[] {
  return (match.waitlistPlayerIds ?? []).map((id) => {
    const found = match.roster?.[id];
    return {
      kind: 'waitlist' as const,
      id,
      name: found?.name || t('matches.guestPlayer'),
      role: found?.role || ('Striker' as const),
      photoURL: found?.photoURL,
      photoUserId: id,
    };
  });
}

/** '/match/<id>' → the id, for links opened cold. */
export function matchIdFromPath(pathname: string): string | null {
  return pathname.match(/^\/match\/([a-zA-Z0-9_-]+)\/?$/)?.[1] ?? null;
}

export function shareMatchLink(matchId: string) {
  navigator.clipboard.writeText(`${window.location.origin}/match/${matchId}`);
  alert(t('matches.shareCopied'));
}
