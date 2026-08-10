import { t } from '../i18n';
import type { MatchData, MatchGuest, PlayerRole, UserProfile } from '../types';
import { getAvatarUrl } from './avatars';

/** Extra hold / waitlist spots beyond match capacity */
export const WAITLIST_SLOTS = 4;

export type RosterEntry =
  | {
      kind: 'player';
      id: string;
      name: string;
      email?: string;
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
      email?: string;
      role?: PlayerRole;
      photoURL?: string;
      photoUserId: string;
    };

export function getOccupiedCount(match: MatchData) {
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

export function resolveJoinedPlayers(
  match: MatchData,
  allPlayers: UserProfile[],
): UserProfile[] {
  return match.joinedPlayerIds.map((id) => {
    return (
      allPlayers.find((p) => p.id === id) || {
        id,
        name: t('matches.guestPlayer'),
        email: '',
        role: 'Striker' as const,
        photoURL: getAvatarUrl(id),
      }
    );
  });
}

export function resolveRoster(match: MatchData, allPlayers: UserProfile[]): RosterEntry[] {
  const players: RosterEntry[] = match.joinedPlayerIds.map((id) => {
    const found = allPlayers.find((p) => p.id === id);
    return {
      kind: 'player' as const,
      id,
      name: found?.name || t('matches.guestPlayer'),
      email: found?.email,
      role: found?.role || ('Striker' as const),
      photoURL: found?.photoURL,
      photoUserId: id,
    };
  });

  const guests: RosterEntry[] = (match.guests ?? []).map((guest: MatchGuest) => {
    const host = allPlayers.find((p) => p.id === guest.addedBy);
    return {
      kind: 'guest' as const,
      id: guest.id,
      name: t('matches.guest'),
      addedBy: guest.addedBy,
      photoURL: host?.photoURL,
      photoUserId: guest.addedBy,
      role: 'Striker' as const,
    };
  });

  return [...players, ...guests];
}

export function resolveWaitlist(
  match: MatchData,
  allPlayers: UserProfile[],
): Extract<RosterEntry, { kind: 'waitlist' }>[] {
  return (match.waitlistPlayerIds ?? []).map((id) => {
    const found = allPlayers.find((p) => p.id === id);
    return {
      kind: 'waitlist' as const,
      id,
      name: found?.name || t('matches.guestPlayer'),
      email: found?.email,
      role: found?.role || ('Striker' as const),
      photoURL: found?.photoURL,
      photoUserId: id,
    };
  });
}

export function shareMatchLink(matchId: string) {
  navigator.clipboard.writeText(`${window.location.origin}/match/${matchId}`);
  alert(t('matches.shareCopied'));
}
