import child from '@/i18n/child';
import common from '@/i18n/common';
import onboarding from '@/i18n/onboarding';
import parent from '@/i18n/parent';
import screen from '@/i18n/screen';
import { DICT, type Bundle, type Entry, type Lang } from '@/i18n';

const LANGS: Lang[] = ['ru', 'kk', 'en'];
const BUNDLES: Record<string, Bundle> = { common, child, parent, onboarding, screen };

// A plain string and plural forms are interchangeable (tn() takes both; Kazakh needs no plural forms), lists are not.
const shape = (e: Entry) => (Array.isArray(e) ? `list(${e.length})` : 'text');
// {name} placeholders of an entry; plural forms are merged (a form may legitimately drop {n}, e.g. "one day").
function placeholders(e: Entry): string[] {
  const texts = typeof e === 'string' ? [e] : Array.isArray(e) ? e : Object.values(e).filter((x): x is string => typeof x === 'string');
  return [...new Set(texts.flatMap((s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1])))].sort();
}

describe('i18n dictionaries', () => {
  describe.each(Object.entries(BUNDLES))('%s bundle', (_, bundle) => {
    it('has the same keys in ru, kk and en', () => {
      const ru = Object.keys(bundle.ru).sort();
      expect(Object.keys(bundle.kk).sort()).toEqual(ru);
      expect(Object.keys(bundle.en).sort()).toEqual(ru);
    });
  });

  it('has no key defined in two bundles (later bundles would silently override)', () => {
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const [name, b] of Object.entries(BUNDLES))
      for (const k of Object.keys(b.ru)) {
        if (seen.has(k)) dupes.push(`${k} (${seen.get(k)} + ${name})`);
        seen.set(k, name);
      }
    expect(dupes).toEqual([]);
  });

  it('merged dictionaries have identical key sets', () => {
    const ru = Object.keys(DICT.ru).sort();
    for (const l of LANGS) expect(Object.keys(DICT[l]).sort()).toEqual(ru);
  });

  it('every key has the same kind of entry and the same {placeholders} in all languages', () => {
    const problems: string[] = [];
    for (const key of Object.keys(DICT.ru)) {
      const ref = DICT.ru[key];
      for (const l of LANGS) {
        const e = DICT[l][key];
        if (shape(e) !== shape(ref)) problems.push(`${key}: ${l} is ${shape(e)}, ru is ${shape(ref)}`);
        else if (placeholders(e).join() !== placeholders(ref).join()) problems.push(`${key}: ${l} {${placeholders(e)}} vs ru {${placeholders(ref)}}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('plural entries always have an "other" form and no empty strings anywhere', () => {
    const problems: string[] = [];
    for (const l of LANGS)
      for (const [key, e] of Object.entries(DICT[l])) {
        if (typeof e === 'object' && !Array.isArray(e) && !e.other) problems.push(`${l} ${key}: no "other"`);
        const texts = typeof e === 'string' ? [e] : Array.isArray(e) ? e : Object.values(e);
        if (texts.some((s) => typeof s !== 'string' || !s.trim())) problems.push(`${l} ${key}: empty text`);
      }
    expect(problems).toEqual([]);
  });
});
