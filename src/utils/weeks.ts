/** Matches a user may create per calendar week */
export const WEEKLY_MATCH_LIMIT = 2;

/** Monday 00:00 local through the next Monday 00:00 local; `end` is exclusive. */
export function weekBounds(date: Date): { start: Date; end: Date } {
  const daysSinceMonday = (date.getDay() + 6) % 7;
  // Built from calendar fields so a DST change inside the week can't shift the edges.
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - daysSinceMonday);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  return { start, end };
}

export function isSameLocalWeek(a: Date, b: Date): boolean {
  return weekBounds(a).start.getTime() === weekBounds(b).start.getTime();
}
