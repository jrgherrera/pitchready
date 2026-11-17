/** Self-check for week math — run: NODE_NO_WARNINGS=1 npx tsx src/utils/weeks.check.ts */
import assert from 'node:assert/strict';
import { weekBounds, isSameLocalWeek } from './weeks';

// Monday is the first day; the window is half-open.
{
  const { start, end } = weekBounds(new Date('2026-11-18T15:00:00'));
  assert.equal(start.getDay(), 1, 'starts Monday');
  assert.equal(start.getHours(), 0);
  assert.equal(start.getMinutes(), 0);
  assert.equal(end.getTime() - start.getTime(), 7 * 24 * 60 * 60 * 1000);
}

// Review Focus 5: the two sides of the Sunday/Monday midnight edge are different weeks.
{
  const sundayLate = new Date('2026-11-22T23:00:00');
  const mondayEarly = new Date('2026-11-23T00:30:00');
  assert.equal(isSameLocalWeek(sundayLate, mondayEarly), false, 'week flips at local midnight Monday');
  assert.equal(isSameLocalWeek(new Date('2026-11-16T12:00:00'), sundayLate), true, 'Mon..Sun is one week');
}

// A Monday kick-off at 00:00 belongs to the week it opens, not the one before.
{
  const monday = new Date('2026-11-23T00:00:00');
  assert.equal(weekBounds(monday).start.getTime(), monday.getTime());
}

console.log('weeks.check: ok');
