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
];

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
