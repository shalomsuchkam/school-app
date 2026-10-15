export type Lang = 'ru' | 'kk' | 'en';
// A plain string, a list (weekday names) or plural forms picked by Intl.PluralRules.
export type Entry = string | string[] | { one?: string; few?: string; many?: string; other: string };
export type Bundle = Record<Lang, Record<string, Entry>>;
