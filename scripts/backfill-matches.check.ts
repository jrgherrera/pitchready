import assert from 'node:assert/strict';
import { Timestamp } from 'firebase/firestore';
import { parseLegacyDate, planBackfill, previewDiffers } from './backfill-matches';

const users = {
  a: { id: 'a', name: 'Ana' },
  b: { id: 'b', name: 'Bo', role: 'Keeper' as const },
};
const legacy = {
  title: 'T',
  date: '2026-11-20',
  capacity: 10,
  creatorId: 'a',
  joinedPlayerIds: ['a', 'b'],
  waitlistPlayerIds: [],
};

// A date-only string becomes a Timestamp at local midnight; memberIds, creatorName, roster and preview are filled.
const p = planBackfill('m1', legacy, users);
const d = (p.patch.date as Timestamp).toDate();
assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()], [2026, 10, 20, 0, 0]);
assert.equal(p.dateConverted, true);
assert.deepEqual(p.patch.memberIds, ['a', 'b']);
assert.equal(p.patch.creatorName, 'Ana');
assert.deepEqual(p.patch.roster, { a: { name: 'Ana' }, b: { name: 'Bo', role: 'Keeper' } });
assert.equal(p.preview?.occupiedCount, 2);
assert.equal(p.preview?.creatorName, 'Ana');
assert.equal('joinedPlayerIds' in (p.preview as object), false);
assert.deepEqual(p.unresolved, []);

// Overflow dates are rejected, not rolled into March; an ISO string with a time is accepted.
assert.equal(parseLegacyDate('2026-02-31'), null);
assert.equal(parseLegacyDate('not a date'), null);
assert.equal(parseLegacyDate('2026-11-20T18:30:00Z')?.toISOString(), '2026-11-20T18:30:00.000Z');
const bad = planBackfill('m2', { ...legacy, date: '2026-02-31' }, users);
assert.equal(bad.unresolved.length, 1, 'an unreadable date is unresolved, never "already backfilled"');
assert.equal(bad.preview, null);

// A memberIds that disagrees with the arrays is repaired (the rules derive it from them).
const done = { ...legacy, ...p.patch };
assert.deepEqual(planBackfill('m1', { ...done, memberIds: ['a'] }, users).patch, { memberIds: ['a', 'b'] });

// An already-correct document produces an empty patch, and its own preview is not "different".
const again = planBackfill('m1', done, users);
assert.deepEqual(again.patch, {});
assert.deepEqual(again.unresolved, []);
const stored = { ...again.preview!, date: Timestamp.fromDate(again.preview!.date) };
assert.equal(previewDiffers(stored, again.preview!), false);

// A partial preview (merge-written before the backfill) or a missing one counts as different.
assert.equal(previewDiffers({ title: 'T' }, again.preview!), true);
assert.equal(previewDiffers(undefined, again.preview!), true);
assert.equal(previewDiffers({ ...stored, occupiedCount: 5 }, again.preview!), true);

// A missing users doc is unresolved (not silently skipped) and the other names are still written.
const ghost = planBackfill('m3', { ...legacy, joinedPlayerIds: ['a', 'zz'] }, users);
assert.equal(ghost.unresolved.length, 1);
assert.match(ghost.unresolved[0], /zz/);
assert.deepEqual(Object.keys(ghost.patch.roster), ['a']);
assert.equal(planBackfill('m4', legacy, {}).unresolved.length, 3, 'creator and both players have no users doc');

// A missing creatorId is named up front instead of surfacing as Firestore's undefined error.
const noCreator = planBackfill('m5', { ...legacy, creatorId: undefined }, users);
assert.match(noCreator.unresolved[0], /creatorId/);
assert.deepEqual(noCreator.patch, {});

console.log('backfill-matches.check: ok');
