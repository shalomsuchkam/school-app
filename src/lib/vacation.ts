import type { Access, Vacation } from './api';
import { shortDate } from './format';
import { t, tn } from './i18n';

// Vacations and promo codes: pure helpers for the schedule screen, the vacation sheet and the promo form.
// The server checks the same limits (supabase/functions/app/daysoff.ts, promo.ts); these only spare a round trip.

export const MAX_RANGE_DAYS = 120;
export const PAST_DAYS = 30;
export const FUTURE_DAYS = 400;
export const NOTE_MAX = 40;

/** 'YYYY-MM-DD' + n calendar days (UTC arithmetic: no daylight-saving surprises). */
export function addDaysIso(iso: string, n: number) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** Days from `a` to `b` (b - a). */
export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}
const clampIso = (v: string, lo: string, hi: string) => (v < lo ? lo : v > hi ? hi : v);

/** Earliest and latest dates the vacation sheet offers, given the family's today and the chosen start. */
export function rangeBounds(today: string, from?: string) {
  const min = addDaysIso(today, -PAST_DAYS);
  const max = addDaysIso(today, FUTURE_DAYS);
  const toMax = from ? (addDaysIso(from, MAX_RANGE_DAYS - 1) < max ? addDaysIso(from, MAX_RANGE_DAYS - 1) : max) : max;
  return { min, max, toMin: from ?? min, toMax };
}

/** A new start keeps the range valid: the end moves along when it would fall before the start or past 120 days. */
export function withFrom(r: { from: string; to: string }, from: string, today: string) {
  const b = rangeBounds(today, from);
  const f = clampIso(from, b.min, b.max);
  return { from: f, to: clampIso(r.to, f, rangeBounds(today, f).toMax) };
}

/** The i18n key of what is wrong with a range, or null when the server will accept it. */
export function rangeProblem(from: string, to: string, today: string): string | null {
  if (to < from) return 'parent.vac.errOrder';
  if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) return 'parent.vac.errLong';
  const b = rangeBounds(today);
  if (from < b.min || to > b.max) return 'parent.vac.errWindow';
  return null;
}

/** "пн, 29 дек – пн, 11 янв" (one date for a single day). */
export function rangeLabel(from: string, to: string) {
  return from === to ? shortDate(from) : `${shortDate(from)} – ${shortDate(to)}`;
}

/** Title and subtitle of a vacation row: its name (or "Days off") and "dates · N days". */
export function vacationLine(v: Vacation) {
  return { title: v.note || t('parent.vac.unnamed'), subtitle: `${rangeLabel(v.from, v.to)} · ${tn('parent.vac.days', v.days)}` };
}

/**
 * The ranges the vacation list shows: not over yet, and not a lone unnamed day the single-day chips already show
 * (`chips` = the dates those chips cover).
 */
export function listedVacations(list: Vacation[] | undefined, today: string, chips: string[]) {
  const shown = new Set(chips);
  return (list ?? []).filter((v) => v.to >= today && (v.days > 1 || !!v.note || !shown.has(v.from)));
}

/** What a person typed → the code the server stores (upper case, no spaces or dashes). */
export const normPromo = (s: string) => s.toUpperCase().replace(/[\s\-_.]/g, '');
/** Plausible before asking the server: 6–16 of A–Z / 2–9 without the look-alikes 0, O, 1, I. */
export const promoLooksValid = (s: string) => /^[A-HJ-NP-Z2-9]{6,16}$/.test(normPromo(s));

/** "Access open forever" / "Access open until …" after a redeemed code. */
export function promoSuccess(a: Pick<Access, 'free_forever' | 'granted_until'>) {
  if (a.free_forever || !a.granted_until) return t('parent.promo.forever');
  return t('parent.promo.until', { date: shortDate(a.granted_until.slice(0, 10)) });
}
