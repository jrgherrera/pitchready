import type { PlayerRole } from '../types';

/** Deal order — keepers first so every team gets one, then captains and the outfield lines. */
const ROLE_ORDER: PlayerRole[] = ['Keeper', 'Captain', 'Defender', 'Midfield', 'Striker'];

export const DEFAULT_TEAM_COUNT = 2;

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Split a roster into balanced teams: keepers are dealt first (one per team while
 * they last), then each remaining line, always to the team holding the fewest of
 * that role — total squad size breaks the tie. Order within a role is random, so
 * re-running gives a different draw.
 */
export function buildTeams<T extends { role?: PlayerRole }>(
  members: T[],
  teamCount: number,
): T[][] {
  const teams: T[][] = Array.from({ length: Math.max(1, Math.floor(teamCount)) }, () => []);
  const roleOf = (m: T) => m.role ?? 'Striker';
  const rank = (m: T) => {
    const i = ROLE_ORDER.indexOf(roleOf(m));
    return i < 0 ? ROLE_ORDER.length : i;
  };
  // Same-role count dominates; +team.length keeps overall sizes even on ties.
  const cost = (team: T[], role: PlayerRole) =>
    team.filter((m) => roleOf(m) === role).length * (members.length + 1) + team.length;

  // Stable sort, so the shuffle survives as the within-role order.
  for (const member of shuffle(members).sort((a, b) => rank(a) - rank(b))) {
    const role = roleOf(member);
    let best = 0;
    for (let i = 1; i < teams.length; i++) {
      if (cost(teams[i], role) < cost(teams[best], role)) best = i;
    }
    teams[best].push(member);
  }

  return teams;
}
