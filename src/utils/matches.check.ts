/** Self-check for membership + roster helpers — run: NODE_NO_WARNINGS=1 npx tsx src/utils/matches.check.ts */
import assert from 'node:assert/strict';
import { computeMemberIds, rosterEntryFor } from './matches';

// Creator, roster and waitlist in one array, creator first, no duplicates.
assert.deepEqual(
  computeMemberIds({ creatorId: 'u1', joinedPlayerIds: ['u1', 'u2'], waitlistPlayerIds: ['u3'] }),
  ['u1', 'u2', 'u3'],
);

// A creator who left their own match stays a member.
assert.deepEqual(
  computeMemberIds({ creatorId: 'u1', joinedPlayerIds: ['u2'], waitlistPlayerIds: [] }),
  ['u1', 'u2'],
);

// Missing waitlist is the same as empty.
assert.deepEqual(
  computeMemberIds({ creatorId: 'u1', joinedPlayerIds: [], waitlistPlayerIds: undefined }),
  ['u1'],
);

// Roster entries carry no undefined keys — Firestore rejects undefined values.
{
  const entry = rosterEntryFor({ id: 'u1', name: 'Jorge', role: undefined, photoURL: undefined });
  assert.deepEqual(Object.keys(entry), ['name']);
  assert.equal(entry.name, 'Jorge');
}

// Present optionals are carried over.
assert.deepEqual(
  rosterEntryFor({ id: 'u1', name: 'Jorge', role: 'Keeper', photoURL: 'p.png' }),
  { name: 'Jorge', role: 'Keeper', photoURL: 'p.png' },
);

// Review Focus 2: a legacy match must not be invisible to its own creator.
assert.deepEqual(
  computeMemberIds({ creatorId: 'u1', joinedPlayerIds: [], waitlistPlayerIds: [] }),
  ['u1'],
  'the creator is always a member, so a backfilled match always matches their query',
);

console.log('matches.check: ok');
