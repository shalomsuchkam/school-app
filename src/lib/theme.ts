import { useColorScheme } from 'react-native';

// Contrast (WCAG 2.1): ink/ink2/muted ≥ 4.5:1 on bg, card and fill in both schemes; `border` ≥ 3:1 on bg and card
// (input/chip outlines); `line` is a decorative hairline only. `brandFill` carries white text at ≥ 4.5:1.
const light = {
  bg: '#F4F2FA',
  bgElevated: '#FFFFFF',
  card: '#FFFFFF',
  ink: '#17142E',
  ink2: '#3D3A57',
  muted: '#6B6789',
  line: '#E2DEEF',
  border: '#8A86AA',
  fill: '#EFECF8',
  brand: '#5A4BEF',
  brandFill: '#5A4BEF',
  brandSoft: '#ECEAFE',
  onInkAccent: '#B7AEFF',
  ok: '#0B8566',
  okSoft: '#E1F6EF',
  warn: '#E68A00',
  warnSoft: '#FFF1D9',
  bad: '#D7343A',
  badSoft: '#FDE8E8',
  scrim: 'rgba(14,11,34,0.45)',
  shadow: '#4B3FC4',
};
const dark: typeof light = {
  bg: '#0E0C1D',
  bgElevated: '#17152B',
  card: '#1B1932',
  ink: '#F3F1FF',
  ink2: '#CFCBEA',
  muted: '#9E9AC4',
  line: '#34305A',
  border: '#77739F',
  fill: '#24213F',
  brand: '#8478FF',
  brandFill: '#6355F5',
  brandSoft: '#201D44',
  onInkAccent: '#4B3DD9',
  ok: '#34D399',
  okSoft: '#12352C',
  warn: '#FBBF24',
  warnSoft: '#3A2D0B',
  bad: '#F87171',
  badSoft: '#3D1A1E',
  scrim: 'rgba(0,0,0,0.6)',
  shadow: '#000000',
};
export type Palette = typeof light;
export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

export const font = {
  semibold: 'Nunito_600SemiBold',
  bold: 'Nunito_700Bold',
  extra: 'Nunito_800ExtraBold',
  black: 'Nunito_900Black',
};

// Size-specific tracking: large text tighter, small text slightly open.
export const type = {
  largeTitle: { fontFamily: font.black, fontSize: 32, letterSpacing: -0.6, lineHeight: 38 },
  title: { fontFamily: font.black, fontSize: 22, letterSpacing: -0.3, lineHeight: 28 },
  headline: { fontFamily: font.extra, fontSize: 17, letterSpacing: -0.1, lineHeight: 22 },
  body: { fontFamily: font.bold, fontSize: 16, letterSpacing: 0, lineHeight: 22 },
  callout: { fontFamily: font.bold, fontSize: 15, letterSpacing: 0, lineHeight: 20 },
  sub: { fontFamily: font.bold, fontSize: 13, letterSpacing: 0.1, lineHeight: 18 },
  caps: { fontFamily: font.black, fontSize: 12, letterSpacing: 0.8, lineHeight: 16 },
} as const;

export const gradients = {
  brand: ['#5A4BEF', '#8B4CF0'] as const, // white text ≥ 4.5:1 across the whole gradient
  ok: ['#0FA37F', '#2BC9A0'] as const,
  warn: ['#F08C00', '#FDB241'] as const,
  bad: ['#E5484D', '#FF7A7E'] as const,
  night: ['#2B2560', '#4B3FC4'] as const,
};

export const radius = { s: 12, m: 16, l: 22, xl: 28 };
