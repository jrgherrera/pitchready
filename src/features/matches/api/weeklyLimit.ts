import type { MatchData } from '../../../types';
import { countLiveMatches } from '../../../utils/matches';
import { WEEKLY_MATCH_LIMIT } from '../../../utils/weeks';

/**
 * Matches `uid` created that are still active. Joining someone else's game never counts: the cap
 * limits creation, and counting joins would punish the keenest player. Cancelled matches free
 * the slot. The Firestore query lives in `./matchWrites` (`countMyActiveMatchesInWeek`) — this is
 * its pure half, kept apart because `src/lib/firebase` cannot load outside Vite.
 *
 * The cap is a client-side check: rules cannot count documents and the project has no Cloud
 * Function. It stops casual abuse; someone using the SDK directly can bypass it, and the ceiling
 * is junk documents the owner can see.
 */
export function countCreatedActive(matches: MatchData[], uid: string): number {
  return countLiveMatches(matches.filter((m) => m.creatorId === uid));
}

export function isWeekAtLimit(count: number): boolean {
  return count >= WEEKLY_MATCH_LIMIT;
}
