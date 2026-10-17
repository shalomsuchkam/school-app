import type { CalendarDay, CalendarStatus } from './api';
import { locale } from './i18n';

// Month calendar helpers (pure): 'YYYY-MM' months, Monday-first weeks, locale month names.
export type Cell = { date: string; day: number } | null;

const pad = (n: number) => String(n).padStart(2, '0');

export function monthOf(iso: string) {
  return iso.slice(0, 7);
}

export function addMonths(month: string, n: number) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export function daysInMonth(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Weeks of the month, Monday first; days outside the month are null. Always whole weeks of 7. */
export function monthGrid(month: string): Cell[][] {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0 = Sunday
  const lead = (first + 6) % 7; // Monday = 0
  const n = daysInMonth(month);
  const cells: Cell[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= n; d++) cells.push({ date: `${month}-${pad(d)}`, day: d });
  while (cells.length % 7) cells.push(null);
  const weeks: Cell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const cap = (s: string) => (s ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : s);

/** "Октябрь 2026" in the app language (stand-alone month name), with a numeric fallback. */
export function monthTitle(month: string, loc = locale()) {
  const [y, m] = month.split('-').map(Number);
  try {
    const d = new Date(Date.UTC(y, m - 1, 15));
    const name = new Intl.DateTimeFormat(loc, { month: 'long', timeZone: 'UTC' }).format(d);
    // a bare number means the runtime has no month names for this locale
    if (!/^\d+$/.test(name)) return `${cap(name)} ${y}`;
  } catch {}
  return `${pad(m)}.${y}`;
}

/** Narrow weekday names Monday..Sunday from Intl (e.g. "пн"), or null when unavailable. */
export function weekdayNames(loc = locale()): string[] | null {
  try {
    const f = new Intl.DateTimeFormat(loc, { weekday: 'short', timeZone: 'UTC' });
    // 2024-01-01 was a Monday
    const names = Array.from({ length: 7 }, (_, i) => f.format(new Date(Date.UTC(2024, 0, 1 + i))));
    if (new Set(names).size === 7) return names.map(cap);
  } catch {}
  return null;
}

export const STATUSES: CalendarStatus[] = ['done_on_time', 'done_late', 'partial', 'missed', 'off', 'future', 'empty'];

/** Server days indexed by date; unknown dates fall back to `empty`. */
export function byDate(days: CalendarDay[] | undefined) {
  return new Map((days ?? []).map((d) => [d.date, d]));
}

/** Per-status counts for the month summary. */
export function countStatuses(days: CalendarDay[]) {
  const out = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<CalendarStatus, number>;
  for (const d of days) if (d.status in out) out[d.status]++;
  return out;
}
