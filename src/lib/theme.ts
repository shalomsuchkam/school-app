import { Platform, StyleSheet, useColorScheme, type TextStyle, type ViewStyle } from 'react-native';

import { schemeFor, useAppearance } from './appearance';

/*
 * ───────────────────────────── DESIGN SPEC · «Тетрадь» ─────────────────────────────
 *
 * Idea. The app lives next to a school exercise book, so it borrows that book's honest materials
 * instead of the generic purple-gradient "app" look: warm paper, blue ballpoint ink, the teacher's
 * red pen, a green "accepted" tick. Calm enough for a parent to trust at 22:00, friendly enough for
 * a 9-year-old, and not tied to any one culture's clichés (works for ru / kk / en families).
 *
 * Palette (light / dark, all pairs checked against WCAG 2.1):
 *  · Paper neutrals — one warm grey family (never mixed with cool greys). `bg` is warm paper, `card`
 *    is the white page; dark mode is warm charcoal, never pure #000.
 *  · Ink (brand) — a deep ballpoint blue, used as an ACCENT only: primary buttons, selection, links,
 *    the progress arc. Never as a wallpaper or gradient.
 *  · Semantics — ok = accepted / on time, warn = waiting or late (amber-brown, text-safe), bad = redo /
 *    missed (red pen). Each has a `*Soft` tint for backgrounds and a `*Fill` that carries white text.
 *    `semantic` maps product states to them (success / late / missed / pending).
 *  · Contrast — ink / ink2 / muted / brand / ok / warn / bad ≥ 4.5:1 on bg, card and fill in both schemes;
 *    every `*Fill` carries white text ≥ 4.5:1; `border` ≥ 3:1 (input and control outlines);
 *    `line` is a decorative hairline only. Tile colours (`tile`) carry a white glyph ≥ 3:1.
 *
 * Type. The platform font (SF Pro on iOS, Roboto on Android) — it ships optical sizes and hinting a
 * webfont can't. Hierarchy comes from size + weight + leading as a set; tracking is size-specific
 * (big text tighter, small caps open). Numbers that change use tabular figures. Text follows Dynamic
 * Type; `Txt` caps each style with a maxFontSizeMultiplier only where a layout would break.
 *    display 40/44 · largeTitle 32/38 · title 22/28 · headline 17/22 (600) · label 16/20 (600)
 *    body 16/22 · callout 15/20 · sub 13/18 · caps 12/16 (600, +0.6 tracking, uppercase by caller)
 *
 * Space. 8-pt grid with a 4-pt half step (`space`). Screen gutter 16 (24 from 600 pt). Related items
 * 8 apart, groups 24 apart, section labels sit 24 above and 8 above their group.
 *
 * Shape. Radii nest: inner ≤ outer − padding (`radius`). Cards 18, controls 14, chips/tiles 10, badges 6.
 * Separators are hairlines inset to the text column. Cards on paper use a hairline border, not a
 * drop shadow; shadows (`elevation`) are reserved for things that float: sheets, toasts, the next-step bar.
 *
 * Components (src/components/ui.tsx documents each): Screen, SectionLabel, Group + Row (inset grouped
 * lists, iOS-style tinted icon tiles), Card, Banner, Badge, ProgressBar, StatusBar, Stat, Segmented,
 * Btn (primary / secondary / plain / ghost / ok / bad), IconBtn, Chip, Field, Sheet (spring, drag to
 * dismiss), Toast, Empty, Skeleton, Loading, ErrorBanner, PressableScale, NotebookRule, BrandMark.
 *
 * Appearance. Per device (src/lib/appearance.ts): system, light, dark or by schedule (dark 20:00–07:00);
 * `useScheme` / `usePalette` resolve it, so every screen follows without its own logic.
 *
 * Motion. Press feedback on press-in (scale 0.97, ~110 ms); springs for anything that moves (critically
 * damped by default, a little bounce only after a flick). Everything respects Reduce Motion: movement
 * is dropped, opacity changes stay. Celebration (confetti) is the only "delight" budget — rare by design.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */

const light = {
  // surfaces
  bg: '#F4F2ED',
  bgElevated: '#FFFFFF',
  card: '#FFFFFF',
  fill: '#ECE9E1',
  // text
  ink: '#1A1916',
  ink2: '#46433D',
  muted: '#6A665E',
  // lines
  line: '#E3DFD5',
  border: '#8E897E',
  // brand (ink blue): accent only
  brand: '#2A4BB0',
  brandFill: '#2A4BB0',
  brandSoft: '#E6EAF8',
  onInkAccent: '#A9BCFF', // accent text on an `ink` surface (toast)
  // semantics
  ok: '#1D7346',
  okSoft: '#E1F1E6',
  okFill: '#1D7346',
  warn: '#975400',
  warnSoft: '#FBEFD9',
  bad: '#BC3226',
  badSoft: '#FBE6E2',
  badFill: '#BC3226',
  // notebook details: the red margin line and ruled lines (decorative)
  margin: '#E7A39B',
  rule: '#D9E2EE',
  scrim: 'rgba(26,25,22,0.42)',
  shadow: '#4A3F2A',
  // tinted icon tiles (white glyph on top)
  tile: { blue: '#2A4BB0', green: '#1D7346', orange: '#B4570B', red: '#BC3226', teal: '#0F6E72', violet: '#5B4BA8', gray: '#6A665E' },
};
const dark: typeof light = {
  bg: '#131311',
  bgElevated: '#1C1B18',
  card: '#1E1D1A',
  fill: '#2A2925',
  ink: '#F3F0E9',
  ink2: '#D0CBC1',
  muted: '#A29D92',
  line: '#34322D',
  border: '#75705F',
  brand: '#9AAEFF',
  brandFill: '#3554C4',
  brandSoft: '#1E2542',
  onInkAccent: '#2A4BB0',
  ok: '#62C98F',
  okSoft: '#163021',
  okFill: '#1F7A4A',
  warn: '#EDB44E',
  warnSoft: '#33291A',
  bad: '#FF8D7E',
  badSoft: '#3A1D19',
  badFill: '#B53A2E',
  margin: '#6B3530',
  rule: '#26303D',
  scrim: 'rgba(0,0,0,0.6)',
  shadow: '#000000',
  tile: { blue: '#3554C4', green: '#1F7A4A', orange: '#A9530E', red: '#B53A2E', teal: '#13767A', violet: '#5E50B0', gray: '#5E5A52' },
};
export type Palette = typeof light;
export type TileColor = keyof Palette['tile'];
// For surfaces outside React Native views (the Android home-screen widget renders both schemes).
export const palettes = { light, dark };
// The scheme in use: Settings → Appearance (system / light / dark / by schedule, per device) over the system one.
export function useScheme(): 'light' | 'dark' {
  const system = useColorScheme();
  const a = useAppearance();
  return schemeFor(a, system);
}
export function usePalette(): Palette {
  return useScheme() === 'dark' ? dark : light;
}

// Product states → semantic colours (one place to change what "late" looks like everywhere).
export const semantic = (p: Palette) => ({
  success: { fg: p.ok, soft: p.okSoft, fill: p.okFill },
  late: { fg: p.warn, soft: p.warnSoft, fill: p.warn },
  missed: { fg: p.bad, soft: p.badSoft, fill: p.badFill },
  pending: { fg: p.warn, soft: p.warnSoft, fill: p.warn },
});

// System font only: weights carry the hierarchy.
export const font = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const satisfies Record<string, TextStyle['fontWeight']>;

// Size-specific tracking and leading (tight on large text, slightly open on small caps).
export const type = {
  display: { fontSize: 40, lineHeight: 44, letterSpacing: -1, fontWeight: font.bold },
  largeTitle: { fontSize: 32, lineHeight: 38, letterSpacing: -0.7, fontWeight: font.bold },
  title: { fontSize: 22, lineHeight: 28, letterSpacing: -0.4, fontWeight: font.bold },
  headline: { fontSize: 17, lineHeight: 22, letterSpacing: -0.3, fontWeight: font.semibold },
  label: { fontSize: 16, lineHeight: 20, letterSpacing: -0.2, fontWeight: font.semibold },
  body: { fontSize: 16, lineHeight: 22, letterSpacing: -0.2, fontWeight: font.regular },
  callout: { fontSize: 15, lineHeight: 20, letterSpacing: -0.15, fontWeight: font.regular },
  sub: { fontSize: 13, lineHeight: 18, letterSpacing: -0.05, fontWeight: font.regular },
  caps: { fontSize: 12, lineHeight: 16, letterSpacing: 0.6, fontWeight: font.semibold },
} as const satisfies Record<string, TextStyle>;

// 8-pt grid with a 4-pt half step.
export const space = { xxs: 4, xs: 8, s: 12, m: 16, l: 24, xl: 32, xxl: 48 } as const;

// Nested radii: inner elements tighter than their container.
export const radius = { xs: 6, s: 10, m: 14, l: 18, xl: 24, pill: 999 } as const;

export const hairline = StyleSheet.hairlineWidth;

// Shadows only for floating layers, tinted with the paper hue (never generic black in light mode).
export function elevation(p: Palette, level: 1 | 2 | 3): ViewStyle {
  const s = { 1: [0.06, 8, 2, 1], 2: [0.12, 18, 6, 6], 3: [0.18, 28, -4, 16] }[level];
  return Platform.select<ViewStyle>({
    android: { elevation: s[3] },
    default: { shadowColor: p.shadow, shadowOpacity: s[0], shadowRadius: s[1], shadowOffset: { width: 0, height: s[2] } },
  });
}
