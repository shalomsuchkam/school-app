import { locale, t, ta } from './i18n';

// Weekday names in the current language; d = ISO weekday 1..7.
export const wdShort = (d: number) => ta('common.wdShort')[d - 1] ?? '';
export const wdLong = (d: number) => ta('common.wdLong')[d - 1] ?? '';
export const toMin = (hm: string) => {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
};
export const fromMin = (m: number) => {
  const x = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
};
export function duration(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? t('common.dur.hm', { h, m }) : t('common.dur.m', { m });
}
export function isoWeekday(iso: string) {
  const w = new Date(iso + 'T00:00:00').getDay();
  return w === 0 ? 7 : w;
}
export function shortDate(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return t('common.dateShort', { wd: wdShort(isoWeekday(iso)), d: d.getDate(), mon: ta('common.monShort')[d.getMonth()] });
}
// "четверг, 15 октября" — built on the device so it follows the chosen language.
export function longDate(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return t('common.dateLong', { wd: ta('common.wdLongLower')[isoWeekday(iso) - 1], d: d.getDate(), mon: ta('common.monLong')[d.getMonth()] });
}
export function localIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function weekdaysLabel(w: number[] | null) {
  if (!w || !w.length) return t('common.everySchoolDay');
  const s = [...w].sort();
  if (s.join() === '1,2,3,4,5') return t('common.monFri');
  return s.map((d) => wdShort(d)).join(', ');
}

// ---------- presence ----------
export const ONLINE_MS = 5 * 60_000;
/** "2 часа назад" via Intl.RelativeTimeFormat in the app language (falls back to "2 ч назад"). */
export function relativeAgo(iso: string, now: number = Date.now(), loc = locale()): string {
  const diff = Math.max(0, now - Date.parse(iso));
  const min = Math.floor(diff / 60_000);
  const [n, unit]: [number, Intl.RelativeTimeFormatUnit] =
    min < 60 ? [min, 'minute'] : min < 1440 ? [Math.floor(min / 60), 'hour'] : min < 1440 * 30 ? [Math.floor(min / 1440), 'day'] : [Math.floor(min / (1440 * 30)), 'month'];
  try {
    return new Intl.RelativeTimeFormat(loc, { numeric: 'auto' }).format(-n, unit);
  } catch {
    return t('common.ago', { when: unit === 'minute' ? duration(n) : unit === 'hour' ? t('common.dur.h', { h: n }) : t('common.dur.d', { d: n * (unit === 'month' ? 30 : 1) }) });
  }
}
/** Online (seen in the last 5 min) or "был(а) 2 часа назад"; null when the device never called the API. */
export function lastSeen(iso: string | null | undefined, now: number = Date.now()): { online: boolean; text: string } | null {
  if (!iso || Number.isNaN(Date.parse(iso))) return null;
  if (now - Date.parse(iso) < ONLINE_MS) return { online: true, text: t('common.online') };
  return { online: false, text: t('common.seen', { when: relativeAgo(iso, now) }) };
}
