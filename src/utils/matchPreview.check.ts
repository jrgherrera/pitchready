/** Self-check for the preview projection — run: NODE_NO_WARNINGS=1 npx tsx src/utils/matchPreview.check.ts */
import assert from 'node:assert/strict';
import { toPreview } from './matchPreview';
import type { MatchData } from '../types';

const match: MatchData = {
  id: 'm1', title: 'Jueves', date: new Date('2026-11-19T19:00:00'),
  capacity: 10, duration: 60, status: 'needs_players',
  joinedPlayerIds: ['u1', 'u2'], waitlistPlayerIds: ['u3'],
  guests: [{ id: 'g1', addedBy: 'u1', createdAt: 'x' }],
  teams: [{ members: ['u1'] }],
  roster: { u1: { name: 'Jorge' } }, memberIds: ['u1', 'u2', 'u3'],
  creatorId: 'u1', creatorName: 'Jorge',
};

// The private fields must never reach the preview. This is the whole point of the split.
{
  const preview = toPreview(match);
  for (const leaked of ['roster', 'memberIds', 'joinedPlayerIds', 'waitlistPlayerIds', 'guests', 'teams']) {
    assert.ok(!(leaked in preview), `${leaked} must not reach the preview`);
  }
  assert.equal(preview.occupiedCount, 3, 'players plus guests');
  assert.equal(preview.capacity, 10);
  assert.equal(preview.creatorName, 'Jorge');
  assert.equal(preview.title, 'Jueves');
}

// Absent optionals are omitted, not written as undefined.
{
  const bare = toPreview({ ...match, location: undefined, price: undefined, duration: undefined });
  for (const key of Object.keys(bare)) {
    assert.notEqual((bare as unknown as Record<string, unknown>)[key], undefined, `${key} is undefined`);
  }
  assert.ok(!('location' in bare) && !('price' in bare) && !('duration' in bare));
}

console.log('matchPreview.check: ok');
