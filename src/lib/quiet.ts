import { toMin } from './format';

// Quiet hours (family setting): reminders to the child are not sent inside the window.
// The start is inside, the end is not; the window may cross midnight (22:00–07:00).
export type Quiet = { from: string | null; to: string | null } | null | undefined;

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isValidQuiet = (q: Quiet): q is { from: string; to: string } => !!q && !!q.from && !!q.to && HM.test(q.from) && HM.test(q.to) && q.from !== q.to;

/** Is `min` (minutes since midnight) inside the quiet window? */
export function inQuiet(min: number, q: Quiet): boolean {
  if (!isValidQuiet(q)) return false;
  const a = toMin(q.from);
  const b = toMin(q.to);
  const m = ((min % 1440) + 1440) % 1440;
  return a < b ? m >= a && m < b : m >= a || m < b;
}

/** Drops the reminder times (HH:MM or minutes) that fall inside the quiet window. */
export function outsideQuiet<T extends { m: number }>(list: T[], q: Quiet): T[] {
  return list.filter((x) => !inQuiet(x.m, q));
}
