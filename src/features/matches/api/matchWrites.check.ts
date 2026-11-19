/**
 * Self-check for the match-write payload builders — the pure half of `matchWrites.ts`.
 * Run: NODE_NO_WARNINGS=1 npx tsx src/features/matches/api/matchWrites.check.ts
 *
 * It imports `./matchPayloads`, not `./matchWrites`: the latter pulls in `src/lib/firebase`,
 * which reads `import.meta.env` and cannot be loaded outside Vite.
 */
import assert from 'node:assert/strict';
import { FieldValue } from 'firebase/firestore';
import {
  buildCreatePayload,
  buildDetailsPatch,
  buildGuestListPatch,
  buildJoinPatch,
  buildLeavePatch,
} from './matchPayloads';
import type { CreateMatchForm, MatchData, UserProfile } from '../../../types';

const PRIVATE_FIELDS = [
  'roster',
  'memberIds',
  'joinedPlayerIds',
  'waitlistPlayerIds',
  'guests',
  'teams',
];

const match: MatchData = {
  id: 'm1',
  title: 'Jueves',
  date: new Date('2026-11-19T19:00:00'),
  capacity: 10,
  duration: 60,
  status: 'needs_players',
  joinedPlayerIds: ['u1', 'u2'],
  waitlistPlayerIds: [],
  guests: [{ id: 'g1', addedBy: 'u1', createdAt: 'x' }],
  roster: { u1: { name: 'Jorge' }, u2: { name: 'Leo' } },
  memberIds: ['u1', 'u2'],
  creatorId: 'u1',
  creatorName: 'Jorge',
};

/** Capacity 3, roster full (2 players + 1 guest), one waitlister. */
const fullMatchWithWaitlist: MatchData = {
  ...match,
  capacity: 3,
  waitlistPlayerIds: ['w1'],
};

// memberIds and the preview move together with the roster, every time.
{
  const { matchPatch, previewPatch } = buildJoinPatch(match, { id: 'u9', name: 'Ana' }, 'roster');
  assert.ok('memberIds' in matchPatch, 'join updates memberIds');
  assert.ok(matchPatch.memberIds.includes('u9'));
  assert.deepEqual(matchPatch.memberIds, ['u1', 'u2', 'u9'], 'creator first, then the roster');
  assert.equal(previewPatch.occupiedCount, 4, 'preview count follows the roster');
  assert.deepEqual(
    Object.keys(matchPatch).filter((k) => k.startsWith('roster')),
    ['roster.u9'],
    'writes only its own roster key, by dotted path',
  );
  assert.deepEqual(matchPatch['roster.u9'], { name: 'Ana' }, 'no undefined optionals');
  for (const leaked of PRIVATE_FIELDS) {
    assert.ok(!(leaked in previewPatch), `${leaked} must not reach the preview`);
  }
}

// Leaving promotes from the waitlist and drops you from memberIds.
{
  const { matchPatch, previewPatch } = buildLeavePatch(fullMatchWithWaitlist, 'u2');
  assert.ok(!matchPatch.memberIds.includes('u2'));
  assert.ok(matchPatch.joinedPlayerIds.includes('w1'), 'waitlist promoted into the free spot');
  assert.deepEqual(matchPatch.waitlistPlayerIds, [], 'the promoted player left the waitlist');
  assert.ok(!('roster.u2' in matchPatch), 'the leaver keeps their roster entry');
  assert.ok(!('roster' in matchPatch), 'the whole roster map is never written');
  assert.equal(previewPatch.occupiedCount, 3, 'one out, one promoted, the guest stays');
}

// A roster leave takes the leaver's +1 with it; a waitlist leave touches nothing else.
{
  const left = buildLeavePatch(fullMatchWithWaitlist, 'u1');
  assert.deepEqual(left.matchPatch.guests, [], "the leaver's guest goes too");
  assert.deepEqual(left.matchPatch.joinedPlayerIds, ['u2', 'w1'], 'the freed spots are filled');

  const quitWaitlist = buildLeavePatch(fullMatchWithWaitlist, 'w1');
  assert.deepEqual(quitWaitlist.matchPatch.waitlistPlayerIds, []);
  assert.deepEqual(quitWaitlist.matchPatch.joinedPlayerIds, ['u1', 'u2'], 'roster untouched');
  assert.deepEqual(quitWaitlist.matchPatch.guests, [{ id: 'g1', addedBy: 'u1', createdAt: 'x' }]);
  assert.deepEqual(quitWaitlist.matchPatch.memberIds, ['u1', 'u2']);
}

// Review Focus 1: a blind join that loses the capacity race retries as waitlist.
{
  const patch = buildJoinPatch(fullMatchWithWaitlist, { id: 'u9', name: 'Ana' }, 'waitlist');
  assert.ok(patch.matchPatch.waitlistPlayerIds.includes('u9'));
  assert.ok(!patch.matchPatch.joinedPlayerIds.includes('u9'));
  assert.ok(patch.matchPatch.memberIds.includes('u9'), 'a waitlister is a member');
  assert.equal(patch.previewPatch.occupiedCount, 3, 'a waitlist join does not occupy a spot');
  assert.deepEqual(
    Object.keys(patch.matchPatch).filter((k) => k.startsWith('roster')),
    ['roster.u9'],
  );
}

// Why `joinMatch` guards its retry: a waitlist patch does NOT remove the uid from the roster, so
// building one for someone already on the roster puts them on both lists. The rules cannot catch
// it -- `memberIds` is unchanged as a set, so the symmetric-difference check sees nothing. This
// pins the trap, not a bug: the guard in `joinMatch` is what makes it unreachable, and `joinMatch`
// itself cannot be loaded here (it imports `src/lib/firebase`). Delete that guard and this still
// passes -- so if you are here because you removed it, put it back.
{
  const onBoth = buildJoinPatch(fullMatchWithWaitlist, { id: 'u1', name: 'Uno' }, 'waitlist');
  assert.ok(onBoth.matchPatch.waitlistPlayerIds.includes('u1'), 'appended to the waitlist');
  assert.ok(onBoth.matchPatch.joinedPlayerIds.includes('u1'), 'and still on the roster');
  assert.deepEqual(
    [...onBoth.matchPatch.memberIds].sort(),
    ['u1', 'u2', 'w1'],
    'memberIds is unchanged as a set, which is exactly why the rules allow this write',
  );
}

// Removing a guest frees a spot, so the waitlist is reconciled in the same patch.
{
  const { matchPatch, previewPatch } = buildGuestListPatch(fullMatchWithWaitlist, []);
  assert.deepEqual(matchPatch.guests, []);
  assert.ok(matchPatch.joinedPlayerIds.includes('w1'), 'the freed spot promotes the waitlister');
  assert.equal(previewPatch.occupiedCount, 3);
}

// Adding a guest fills the spot and leaves the waitlist where it is.
{
  const guest = { id: 'g2', addedBy: 'u2', createdAt: 'y' };
  const { matchPatch, previewPatch } = buildGuestListPatch(
    { ...match, capacity: 10, waitlistPlayerIds: [] },
    [{ id: 'g1', addedBy: 'u1', createdAt: 'x' }, guest],
  );
  assert.equal(matchPatch.guests.length, 2);
  assert.deepEqual(matchPatch.joinedPlayerIds, ['u1', 'u2']);
  assert.equal(previewPatch.occupiedCount, 4);
}

// An add NEVER promotes, not even with free spots and people waiting. Reachable state: capacity
// was raised to 12 with 9 joined and 3 waiting, then one member brings a +1 — the two strangers
// behind them must not be dragged onto the roster by someone else's click.
{
  const roomy: MatchData = {
    ...match,
    capacity: 12,
    joinedPlayerIds: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9'],
    waitlistPlayerIds: ['w1', 'w2', 'w3'],
    guests: [],
  };
  const guests = [{ id: 'g9', addedBy: 'u2', createdAt: 'z' }];
  const { matchPatch, previewPatch } = buildGuestListPatch(roomy, guests);

  assert.deepEqual(matchPatch.joinedPlayerIds, roomy.joinedPlayerIds, 'roster untouched');
  assert.deepEqual(matchPatch.waitlistPlayerIds, ['w1', 'w2', 'w3'], 'nobody promoted');
  assert.equal(previewPatch.occupiedCount, 10, 'nine players and the new guest');

  // ...and the same list, one guest shorter, does promote: a removal is what frees a spot.
  const removed = buildGuestListPatch({ ...roomy, guests }, []);
  assert.deepEqual(removed.matchPatch.waitlistPlayerIds, [], 'the free spots fill up');
  assert.equal(removed.matchPatch.joinedPlayerIds.length, 12);
}

// Editing the details: the preview tracks every field it is allowed to hold, and nothing else.
{
  const form: CreateMatchForm = {
    title: '',
    location: null,
    date: '2026-11-19',
    time: '21:00',
    capacity: 1,
    duration: 90,
    price: '',
  };
  const { matchPatch, previewPatch } = buildDetailsPatch(form, 'Partido');

  assert.equal(matchPatch.title, 'Partido', 'an empty title falls back to the default');
  assert.equal(matchPatch.capacity, 2, 'capacity floors at 2 on the edit path too');
  assert.equal(
    buildDetailsPatch({ ...form, capacity: 0 }, 'Partido').matchPatch.capacity,
    10,
    'a cleared capacity field is falsy, so it takes the default of 10, not the floor',
  );
  assert.ok(matchPatch.price instanceof FieldValue, "a blank price is deleted, not written as ''");
  assert.ok(matchPatch.location instanceof FieldValue, 'a cleared location is deleted');
  assert.equal(typeof matchPatch.updatedAt, 'string');

  // The preview mirrors the details, including the deletions — a stale price on the public
  // document is a lie to everyone holding the link.
  assert.equal(previewPatch.title, 'Partido');
  assert.equal(previewPatch.capacity, 2);
  assert.equal(previewPatch.duration, 90);
  assert.ok(previewPatch.price instanceof FieldValue);
  assert.ok(previewPatch.location instanceof FieldValue);
  assert.ok(!('updatedAt' in previewPatch), 'updatedAt is not a preview field');
  for (const leaked of PRIVATE_FIELDS) {
    assert.ok(!(leaked in previewPatch), `${leaked} must not reach the preview`);
  }

  // A price and a pin that were set come through as values, not sentinels.
  const pinned = buildDetailsPatch(
    { ...form, title: 'Viernes', price: 50, location: { lat: 1, lng: 2, address: 'Pitch' } },
    'Partido',
  );
  assert.equal(pinned.previewPatch.title, 'Viernes');
  assert.equal(pinned.previewPatch.price, 50);
  assert.deepEqual(pinned.previewPatch.location, { lat: 1, lng: 2, address: 'Pitch' });
}

// A created match carries the membership fields from birth, and its preview carries none of them.
{
  const form: CreateMatchForm = {
    title: '',
    location: null,
    date: '2026-11-19',
    time: '20:30',
    capacity: 1,
    duration: 90,
    price: '',
  };
  const profile: UserProfile = {
    id: 'u1',
    name: 'Jorge',
    email: 'j@example.com',
    role: 'Keeper',
  };
  const { matchPatch, previewPatch } = buildCreatePayload('abc123XYZ', form, profile, 'Partido');

  // The id is handed in, never derived from the clock — see `newMatchId` in matchWrites.ts.
  assert.equal(matchPatch.id, 'abc123XYZ');
  assert.ok(!/^match_\d+$/.test(matchPatch.id), 'ids are not guessable timestamps');
  assert.equal(matchPatch.title, 'Partido', 'an empty title falls back to the default');
  assert.equal(matchPatch.capacity, 2, 'capacity floors at 2');
  assert.deepEqual(matchPatch.memberIds, ['u1']);
  assert.deepEqual(matchPatch.roster, { u1: { name: 'Jorge', role: 'Keeper' } });
  assert.equal(matchPatch.creatorName, 'Jorge');
  assert.ok(!('location' in matchPatch) && !('price' in matchPatch), 'blanks are omitted');
  assert.equal(previewPatch.occupiedCount, 1);
  assert.equal(previewPatch.creatorName, 'Jorge');
  for (const leaked of PRIVATE_FIELDS) {
    assert.ok(!(leaked in previewPatch), `${leaked} must not reach the preview`);
  }
}

console.log('matchWrites.check: ok');
