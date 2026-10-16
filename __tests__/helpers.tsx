import { setLang, type Lang } from '@/lib/i18n';

// Window sizes the layout must survive: from the smallest supported phone to an unfolded foldable.
export const SIZES = [
  { name: 'small phone 320x568', width: 320, height: 568 },
  { name: 'phone 390x844', width: 390, height: 844 },
  { name: 'Android 412x915', width: 412, height: 915 },
  { name: 'tablet 768x1024', width: 768, height: 1024 },
  { name: 'unfolded foldable 884x1104', width: 884, height: 1104 },
] as const;
export const LANGS: Lang[] = ['ru', 'kk', 'en'];

// Every size in every language.
export const MATRIX = SIZES.flatMap((s) => LANGS.map((lang) => ({ ...s, lang, label: `${s.name} · ${lang}` })));

let win = { width: 390, height: 844, scale: 3, fontScale: 1 };
// read by the useWindowDimensions mock in setup.tsx
export const currentWindow = () => win;

export async function applyEnv({ width, height, lang }: { width: number; height: number; lang: Lang }) {
  win = { width, height, scale: 3, fontScale: 1 };
  await setLang(lang);
}

// Flattened style of a host element (RN styles may be nested arrays with falsy entries).
export function flat(style: unknown): Record<string, unknown> {
  if (!style) return {};
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flat));
  return style as Record<string, unknown>;
}
