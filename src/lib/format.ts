export const WD_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
export const WD_LONG = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
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
  return h ? `${h} ч ${m} мин` : `${m} мин`;
}
const MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export function isoWeekday(iso: string) {
  const w = new Date(iso + 'T00:00:00').getDay();
  return w === 0 ? 7 : w;
}
export function shortDate(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return `${WD_SHORT[isoWeekday(iso) - 1]}, ${d.getDate()} ${MON[d.getMonth()]}`;
}
export function localIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function weekdaysLabel(w: number[] | null) {
  if (!w || !w.length) return 'Каждый учебный день';
  const s = [...w].sort();
  if (s.join() === '1,2,3,4,5') return 'Пн–Пт';
  return s.map((d) => WD_SHORT[d - 1]).join(', ');
}
