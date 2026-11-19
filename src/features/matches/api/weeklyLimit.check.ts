/**
 * Run: NODE_NO_WARNINGS=1 npx tsx src/features/matches/api/weeklyLimit.check.ts
 * (imports src/utils/matches.ts, which reads the localStorage global)
 */
import assert from 'node:assert/strict';
import { countCreatedActive, isWeekAtLimit } from './weeklyLimit';
import type { MatchData, MatchStatus } from '../../../types';

const base = { joinedPlayerIds: [], capacity: 10 };
const created = (uid: string, status: MatchStatus) =>
  ({ ...base, creatorId: uid, status }) as unknown as MatchData;
const joined = (uid: string) =>
  ({ ...base, creatorId: 'someone-else', joinedPlayerIds: [uid], status: 'needs_players' }) as unknown as MatchData;

// Only matches I created count. Joining friends' games never blocks hosting my own.
{
  const mine = [created('u1', 'needs_players'), created('u1', 'confirmed'), joined('u1')];
  assert.equal(countCreatedActive(mine, 'u1'), 2);
}
// Other people's matches never count
assert.equal(countCreatedActive([created('u2', 'confirmed')], 'u1'), 0);
// Cancelled frees the slot
assert.equal(countCreatedActive([created('u1', 'cancelled'), created('u1', 'needs_players')], 'u1'), 1);
assert.equal(isWeekAtLimit(1), false);
assert.equal(isWeekAtLimit(2), true);
assert.equal(isWeekAtLimit(3), true);

console.log('weeklyLimit: ok');
