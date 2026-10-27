// deno-lint-ignore-file no-explicit-any
// Vacations: a parent closes (or reopens) a whole range of dates at once, e.g. the winter break set in advance.
// Every date of the range is one app_days_off row, the same rows the single-day chips write, so everything that
// reads days off (next school day, reminders, streaks, the calendar, screen time's school_day) just follows.
// School vacation dates are never built in: the Ministry moves them every year, parents enter them.
import { dropOpenTasks } from "./core.ts";
import { addDays, db, HttpError } from "./lib.ts";

export const MAX_RANGE_DAYS = 120;
export const PAST_DAYS = 30; // a range may start up to 30 days back (a week of illness marked afterwards)
export const FUTURE_DAYS = 400; // and end up to 400 days ahead (next year's breaks)
export const NOTE_MAX = 40;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (s: unknown): s is string =>
  typeof s === "string" && DATE.test(s) && !isNaN(Date.parse(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);

export type DaysOffRange = { from: string; to: string; off: boolean; note: string | null; dates: string[] };

// Validates POST /parent/days-off {from, to, off, note?} against the family's today; throws HttpError(400).
export function parseRange(b: any, today: string): DaysOffRange {
  const from = b?.from, to = b?.to ?? b?.from;
  if (!isDate(from) || !isDate(to)) throw new HttpError(400, "Неверная дата");
  if (to < from) throw new HttpError(400, "Дата «по» раньше даты «с»");
  if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) throw new HttpError(400, "Не больше 120 дней за раз");
  if (from < addDays(today, -PAST_DAYS) || to > addDays(today, FUTURE_DAYS)) throw new HttpError(400, "Даты: от 30 дней назад до 400 дней вперёд");
  if (typeof b.off !== "boolean") throw new HttpError(400, "Неизвестное действие");
  const note = typeof b.note === "string" ? b.note.replace(/\s+/g, " ").trim().slice(0, NOTE_MAX) || null : null;
  const dates: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
  return { from, to, off: b.off, note, dates };
}

// Consecutive dates with the same note, as {from, to, note, days}: how the app lists vacations.
export function groupRanges(rows: { date: string; note?: string | null }[]) {
  const out: { from: string; to: string; note: string | null; days: number }[] = [];
  for (const r of [...rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))) {
    const note = r.note ?? null;
    const last = out[out.length - 1];
    if (last && addDays(last.to, 1) === r.date && last.note === note) {
      last.to = r.date;
      last.days++;
    } else if (!last || last.to !== r.date) out.push({ from: r.date, to: r.date, note, days: 1 });
  }
  return out;
}

export async function applyRange(familyId: string, r: DaysOffRange) {
  if (r.off) {
    // one bulk upsert: the range lands whole or not at all; existing single days get the range's name
    const { error } = await db.from("app_days_off").upsert(r.dates.map((date) => ({ family_id: familyId, date, note: r.note })), { onConflict: "family_id,date" });
    if (error) throw new HttpError(500, error.message);
    await dropOpenTasks(familyId, r.from, r.to, () => true);
  } else {
    const { error } = await db.from("app_days_off").delete().eq("family_id", familyId).gte("date", r.from).lte("date", r.to);
    if (error) throw new HttpError(500, error.message);
  }
  return { ok: true, from: r.from, to: r.to, off: r.off, days: r.dates.length, note: r.off ? r.note : null };
}
