/** Self-check for buildTeams — run: npx tsx src/utils/teams.check.ts */
import assert from 'node:assert/strict';
import type { PlayerRole } from '../types';
import { buildTeams } from './teams';

const roster = (spec: Partial<Record<PlayerRole, number>>) =>
  Object.entries(spec).flatMap(([role, n]) =>
    Array.from({ length: n as number }, (_, i) => ({ id: `${role}${i}`, role: role as PlayerRole })),
  );

const countRole = (team: { role?: PlayerRole }[], role: PlayerRole) =>
  team.filter((m) => m.role === role).length;

// One keeper per team when there are enough to go around.
for (const teamCount of [2, 3, 4]) {
  const teams = buildTeams(roster({ Keeper: teamCount, Defender: 6, Midfield: 5, Striker: 4 }), teamCount);
  assert.equal(teams.length, teamCount);
  assert.ok(teams.every((t) => countRole(t, 'Keeper') === 1), `keeper per team, n=${teamCount}`);
}

// Scarce keepers: no team gets a second one before every team has its first.
{
  const teams = buildTeams(roster({ Keeper: 1, Defender: 4, Striker: 4 }), 3);
  assert.deepEqual(
    teams.map((t) => countRole(t, 'Keeper')).sort(),
    [0, 0, 1],
  );
}

// Every line spread evenly, nobody dropped or duplicated.
{
  const members = roster({ Keeper: 2, Captain: 2, Defender: 6, Midfield: 6, Striker: 6 });
  const teams = buildTeams(members, 2);
  const ids = teams.flat().map((m) => m.id);
  assert.equal(ids.length, members.length);
  assert.equal(new Set(ids).size, members.length);
  for (const role of ['Keeper', 'Captain', 'Defender', 'Midfield', 'Striker'] as PlayerRole[]) {
    const counts = teams.map((t) => countRole(t, role));
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `${role} spread: ${counts}`);
  }
  assert.ok(Math.abs(teams[0].length - teams[1].length) <= 1, 'squad sizes even');
}

// Odd roster, more teams than players, missing roles — all survivable.
assert.equal(buildTeams(roster({ Striker: 3 }), 5).flat().length, 3);
assert.equal(buildTeams([], 2).length, 2);
assert.deepEqual(buildTeams([{ id: 'x' } as { id: string; role?: PlayerRole }], 1)[0].length, 1);

console.log('teams.check: ok');
