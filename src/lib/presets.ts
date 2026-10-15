import { t } from './i18n';

// Names are translated when read (getters), so the lists follow the current interface language.
const SUBJECTS = [
  { key: 'math', emoji: '➗', light: false },
  { key: 'russian', emoji: '✏️', light: false },
  { key: 'literature', emoji: '📖', light: false },
  { key: 'english', emoji: '🇬🇧', light: false },
  { key: 'kazakh', emoji: '🇰🇿', light: false },
  { key: 'history', emoji: '🏛️', light: false },
  { key: 'science', emoji: '🔬', light: false },
  { key: 'biology', emoji: '🌿', light: false },
  { key: 'geography', emoji: '🌍', light: false },
  { key: 'physics', emoji: '⚛️', light: false },
  { key: 'chemistry', emoji: '🧪', light: false },
  { key: 'cs', emoji: '💻', light: false },
  { key: 'music', emoji: '🎵', light: true },
  { key: 'pe', emoji: '⚽', light: true },
  { key: 'art', emoji: '🎨', light: true },
  { key: 'labour', emoji: '🛠️', light: true },
  { key: 'classHour', emoji: '🗣️', light: true },
] as const;

const ITEMS = [
  { key: 'shirt', emoji: '👔', needs_photo: true, required: true },
  { key: 'bag', emoji: '🎒', needs_photo: false, required: true },
  { key: 'peKit', emoji: '👟', needs_photo: false, required: true },
  { key: 'shoes', emoji: '👞', needs_photo: false, required: true },
  { key: 'phone', emoji: '🔋', needs_photo: false, required: false },
  { key: 'readingLog', emoji: '📓', needs_photo: true, required: false },
];

export type SubjectPreset = { name: string; emoji: string; light: boolean };
export type ItemPreset = { title: string; emoji: string; needs_photo: boolean; required: boolean };

// Plain snapshots in the current language — call during render.
export const subjectPresets = (): SubjectPreset[] => SUBJECTS.map(({ key, ...s }) => ({ ...s, name: t(`onboarding.subj.${key}`) }));
export const itemPresets = (): ItemPreset[] => ITEMS.map(({ key, ...i }) => ({ ...i, title: t(`onboarding.item.${key}`) }));

// Back-compatible constants: `name` / `title` are getters that translate on every read.
export const SUBJECT_PRESETS: readonly SubjectPreset[] = SUBJECTS.map(({ key, emoji, light }) => ({
  emoji,
  light,
  get name() {
    return t(`onboarding.subj.${key}`);
  },
}));
export const ITEM_PRESETS: readonly ItemPreset[] = ITEMS.map(({ key, emoji, needs_photo, required }) => ({
  emoji,
  needs_photo,
  required,
  get title() {
    return t(`onboarding.item.${key}`);
  },
}));

export const EMOJIS = ['📘', '➗', '✏️', '📖', '🇬🇧', '🇰🇿', '🏛️', '🔬', '🌿', '🌍', '⚛️', '🧪', '💻', '🎵', '⚽', '🎨', '🛠️', '🗣️', '👔', '🎒', '👟', '👞', '🔋', '📓', '🧮', '🧭', '🎭', '🏊', '✅', '⭐'];

// ---------- quick-start templates ----------
// A grade band pre-selects typical subjects and a Mon–Fri timetable (lessons in order). Everything stays editable.
// Labels: 'onboarding.tpl.<grade>' and 'onboarding.tpl.<grade>Grades'.
export type Grade = 'primary' | 'middle' | 'high';
export const GRADES: readonly { grade: Grade; emoji: string }[] = [
  { grade: 'primary', emoji: '🧸' },
  { grade: 'middle', emoji: '🎒' },
  { grade: 'high', emoji: '🎓' },
];
type Key = (typeof SUBJECTS)[number]['key'];
type Week = Record<1 | 2 | 3 | 4 | 5, Key[]>;

// Kazakhstan (state curriculum, Kazakh/Russian-medium schools).
const KZ: Record<Grade, Week> = {
  primary: {
    1: ['math', 'kazakh', 'literature', 'pe', 'music'],
    2: ['russian', 'math', 'science', 'english'],
    3: ['math', 'kazakh', 'literature', 'art'],
    4: ['russian', 'math', 'english', 'pe', 'labour'],
    5: ['kazakh', 'science', 'cs', 'literature', 'classHour'],
  },
  middle: {
    1: ['math', 'kazakh', 'russian', 'history', 'pe', 'classHour'],
    2: ['math', 'english', 'biology', 'literature', 'geography', 'cs'],
    3: ['math', 'physics', 'kazakh', 'russian', 'labour', 'art'],
    4: ['math', 'chemistry', 'english', 'history', 'literature', 'pe'],
    5: ['math', 'kazakh', 'geography', 'biology', 'physics', 'english'],
  },
  high: {
    1: ['math', 'physics', 'kazakh', 'history', 'english', 'pe'],
    2: ['math', 'chemistry', 'russian', 'literature', 'cs', 'biology'],
    3: ['math', 'physics', 'english', 'geography', 'kazakh', 'history'],
    4: ['math', 'biology', 'chemistry', 'literature', 'russian', 'pe'],
    5: ['math', 'cs', 'english', 'history', 'geography', 'kazakh'],
  },
};
// Russian-medium schools elsewhere in the region.
const CIS: Record<Grade, Week> = {
  primary: {
    1: ['russian', 'math', 'literature', 'pe'],
    2: ['russian', 'math', 'science', 'music'],
    3: ['russian', 'math', 'literature', 'english', 'art'],
    4: ['russian', 'math', 'science', 'pe'],
    5: ['literature', 'english', 'labour', 'classHour'],
  },
  middle: {
    1: ['russian', 'math', 'history', 'english', 'pe', 'classHour'],
    2: ['math', 'literature', 'biology', 'geography', 'russian', 'music'],
    3: ['russian', 'math', 'physics', 'english', 'labour', 'art'],
    4: ['math', 'chemistry', 'history', 'literature', 'cs', 'pe'],
    5: ['russian', 'math', 'english', 'biology', 'physics', 'geography'],
  },
  high: {
    1: ['math', 'russian', 'physics', 'history', 'english', 'pe'],
    2: ['math', 'literature', 'chemistry', 'biology', 'cs', 'geography'],
    3: ['math', 'physics', 'russian', 'english', 'history'],
    4: ['math', 'chemistry', 'literature', 'biology', 'pe'],
    5: ['math', 'cs', 'english', 'history', 'geography', 'russian'],
  },
};
// Everywhere else: a generic international set.
const INTL: Record<Grade, Week> = {
  primary: {
    1: ['english', 'math', 'science', 'pe'],
    2: ['english', 'math', 'art', 'music'],
    3: ['english', 'math', 'science', 'geography'],
    4: ['english', 'math', 'history', 'pe'],
    5: ['english', 'math', 'art', 'cs'],
  },
  middle: {
    1: ['math', 'english', 'science', 'history', 'pe'],
    2: ['math', 'english', 'geography', 'cs', 'art'],
    3: ['math', 'english', 'science', 'history', 'music'],
    4: ['math', 'english', 'science', 'geography', 'pe'],
    5: ['math', 'english', 'cs', 'labour', 'art'],
  },
  high: {
    1: ['math', 'english', 'physics', 'history', 'pe'],
    2: ['math', 'english', 'chemistry', 'biology', 'cs'],
    3: ['math', 'english', 'physics', 'geography', 'history'],
    4: ['math', 'english', 'chemistry', 'biology', 'pe'],
    5: ['math', 'english', 'cs', 'geography', 'physics'],
  },
};
const CIS_COUNTRIES = ['RU', 'BY', 'UZ', 'KG', 'TJ', 'AZ', 'GE', 'AM'];
const curriculum = (country: string) => (country === 'KZ' ? KZ : CIS_COUNTRIES.includes(country) ? CIS : INTL);

export type Template = { subjects: SubjectPreset[]; plan: Record<number, string[]> };

// Snapshot in the current language — call during render or in a handler. Subjects keep timetable order of first appearance.
export function gradeTemplate(country: string, grade: Grade): Template {
  const week = curriculum(country)[grade];
  const presets = subjectPresets();
  const byKey = (k: Key) => presets[SUBJECTS.findIndex((s) => s.key === k)];
  const keys: Key[] = [];
  for (const d of [1, 2, 3, 4, 5] as const) for (const k of week[d]) if (!keys.includes(k)) keys.push(k);
  const plan: Record<number, string[]> = {};
  for (const d of [1, 2, 3, 4, 5] as const) plan[d] = week[d].map((k) => byKey(k).name);
  return { subjects: keys.map(byKey), plan };
}
