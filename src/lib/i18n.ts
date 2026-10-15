import { useSyncExternalStore } from 'react';

import { DICT, type Lang } from '@/i18n';

import { storage } from './storage';

export type { Lang };
export const LANGS: { code: Lang; label: string }[] = [
  { code: 'ru', label: 'Русский' },
  { code: 'kk', label: 'Қазақша' },
  { code: 'en', label: 'English' },
];
const KEY = 'uroki.lang';

// The interface language is per device (a child may prefer Kazakh while the parent reads Russian).
function detect(): Lang {
  try {
    const loc = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase();
    if (loc.startsWith('kk')) return 'kk';
    if (loc.startsWith('ru') || loc.startsWith('uz') || loc.startsWith('ky') || loc.startsWith('be')) return 'ru';
    return 'en';
  } catch {
    return 'ru';
  }
}

let current: Lang = detect();
const listeners = new Set<() => void>();
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};

export const getLang = () => current;
// BCP-47 tag for Intl (dates, numbers).
export const locale = () => ({ ru: 'ru-RU', kk: 'kk-KZ', en: 'en-GB' })[current];

export async function initLang() {
  try {
    const v = await storage.get(KEY);
    if (v === 'ru' || v === 'kk' || v === 'en') current = v;
  } catch {}
}
export async function setLang(l: Lang) {
  current = l;
  listeners.forEach((f) => f());
  try {
    await storage.set(KEY, l);
  } catch {}
}

type Vars = Record<string, string | number>;
const fill = (s: string, v?: Vars) => (v ? s.replace(/\{(\w+)\}/g, (_, k) => (k in v ? String(v[k]) : `{${k}}`)) : s);

// t('child.title', { name }) — falls back to Russian, then to the key itself.
export function t(key: string, vars?: Vars): string {
  const raw = DICT[current][key] ?? DICT.ru[key];
  if (raw === undefined) return key;
  return fill(Array.isArray(raw) ? raw.join(', ') : typeof raw === 'string' ? raw : raw.other, vars);
}

// Plurals: an entry like { one, few, many, other } — chosen by Intl.PluralRules for the current language.
export function tn(key: string, n: number, vars?: Vars): string {
  const raw = DICT[current][key] ?? DICT.ru[key];
  if (raw === undefined) return key;
  if (typeof raw === 'string' || Array.isArray(raw)) return fill(String(raw), { n, ...vars });
  let cat: string = 'other';
  try {
    cat = new Intl.PluralRules(locale()).select(n);
  } catch {}
  return fill((raw as Record<string, string>)[cat] ?? raw.other, { n, ...vars });
}

// Arrays such as weekday names.
export function ta(key: string): string[] {
  const raw = DICT[current][key] ?? DICT.ru[key];
  return Array.isArray(raw) ? raw : [];
}

// Re-renders the component when the language changes.
export function useLang() {
  return useSyncExternalStore(subscribe, getLang, getLang);
}
export function useT() {
  useLang();
  return t;
}
