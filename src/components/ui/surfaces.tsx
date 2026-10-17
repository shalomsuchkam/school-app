import { useEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Line, Path, Rect } from 'react-native-svg';

import { hairline, radius, space, usePalette, type Palette, type TileColor } from '@/lib/theme';

import { Glyph, haptic, Icon, iconOf, Txt, type IconName } from './core';
import { EASE_OUT } from './motion';

export type Tone = 'neutral' | 'brand' | 'ok' | 'warn' | 'bad';
// Foreground / soft background per tone: one mapping for badges, banners, tiles and cards.
export function toneColors(p: Palette, tone: Tone) {
  return {
    neutral: { fg: p.ink2, soft: p.fill },
    brand: { fg: p.brand, soft: p.brandSoft },
    ok: { fg: p.ok, soft: p.okSoft },
    warn: { fg: p.warn, soft: p.warnSoft },
    bad: { fg: p.bad, soft: p.badSoft },
  }[tone];
}

/** A page on the paper: white surface, hairline edge, 18 radius. `tone` tints it for status (done, overdue). */
export function Card({ children, tone, style, padded = true }: { children: ReactNode; tone?: Tone; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const p = usePalette();
  const tinted = tone && tone !== 'neutral';
  return (
    <View style={[styles.card, padded && styles.cardPad, { backgroundColor: tinted ? toneColors(p, tone).soft : p.card, borderColor: tinted ? 'transparent' : p.line }, style]}>{children}</View>
  );
}

/**
 * Icon in a rounded tile. `color` = solid tile with a white glyph (iOS Settings style);
 * `tone` = soft tile with a coloured glyph. Emoji render as-is on a neutral tile.
 */
export function IconTile({ icon, color, tone = 'brand', size = 32 }: { icon: string; color?: TileColor; tone?: Tone; size?: number }) {
  const p = usePalette();
  const isIcon = !!iconOf(icon);
  const bg = !isIcon ? p.fill : color ? p.tile[color] : toneColors(p, tone).soft;
  const fg = color ? '#FFFFFF' : toneColors(p, tone).fg;
  return (
    <View style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Glyph icon={icon} size={Math.round(size * (isIcon ? 0.56 : 0.6))} color={fg} />
    </View>
  );
}

/** Small square-cornered status label (not a pill): icon + text on a soft tint. */
export function Badge({ label, tone = 'neutral', icon, numberOfLines = 2 }: { label: string; tone?: Tone; icon?: IconName; numberOfLines?: number }) {
  const p = usePalette();
  const c = toneColors(p, tone);
  return (
    <View style={[styles.badge, { backgroundColor: c.soft }]}>
      {icon ? <Icon name={icon} size={13} color={c.fg} style={{ marginTop: 2 }} /> : null}
      <Txt v="sub" color={c.fg} numberOfLines={numberOfLines} style={{ flexShrink: 1, fontWeight: '600' }}>
        {label}
      </Txt>
    </View>
  );
}

/** Thin progress track; the fill glides to new values (instant with Reduce Motion). */
export function ProgressBar({ value, color, track, height = 8, style }: { value: number; color?: string; track?: string; height?: number; style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  const reduce = useReducedMotion();
  const v = Math.max(0, Math.min(1, value));
  const w = useSharedValue(reduce ? v : 0);
  useEffect(() => {
    w.set(reduce ? v : withTiming(v, { duration: 600, easing: EASE_OUT }));
  }, [v, reduce, w]);
  // an absolutely positioned, childless fill: animating its width re-lays out nothing else
  const fill = useAnimatedStyle(() => ({ width: `${w.get() * 100}%` }));
  return (
    <View style={[{ height, borderRadius: height / 2, backgroundColor: track ?? p.fill, overflow: 'hidden' }, style]}>
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: height / 2, backgroundColor: color ?? p.brand }, fill]} />
    </View>
  );
}

/** Stacked status bar: one segment per state, proportional to its count (status at a glance). */
export function SegmentBar({ parts, height = 8, track }: { parts: { value: number; color: string }[]; height?: number; track?: string }) {
  const p = usePalette();
  const shown = parts.filter((x) => x.value > 0);
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track ?? p.fill, overflow: 'hidden', flexDirection: 'row', gap: shown.length > 1 ? 2 : 0 }}>
      {shown.map((x, i) => (
        <View key={i} style={{ flex: x.value, backgroundColor: x.color }} />
      ))}
    </View>
  );
}

/** Number + label tile for dashboards (tabular figures, optional leading icon). */
export function Stat({ value, label, icon, color, iconColor, style }: { value: string | number; label: string; icon?: IconName; color?: string; iconColor?: string; style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  return (
    <View accessible accessibilityLabel={`${value} ${label}`} style={[styles.stat, { backgroundColor: p.card, borderColor: p.line }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon ? <Icon name={icon} size={18} color={iconColor ?? color ?? p.ink} /> : null}
        <Txt v="title" color={color ?? p.ink} style={{ fontVariant: ['tabular-nums'] }}>
          {value}
        </Txt>
      </View>
      <Txt v="sub" color={p.muted} numberOfLines={2}>
        {label}
      </Txt>
    </View>
  );
}

/**
 * Segmented control: peers, not a hierarchy, so selection switches instantly (no sliding).
 * Native-feeling on both platforms: a sunken track with a raised selected segment.
 */
export function Segmented<T extends string | number>({ options, value, onChange, style }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  return (
    <View accessibilityRole="tablist" style={[styles.seg, { backgroundColor: p.fill }, style]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="tab"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (on) return;
              haptic.tap();
              onChange(o.value);
            }}
            style={[styles.segItem, on && { backgroundColor: p.card, borderColor: p.line, borderWidth: hairline }]}
          >
            <Txt v="callout" color={on ? p.ink : p.muted} numberOfLines={1} style={{ textAlign: 'center', fontWeight: on ? '600' : '500' }}>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Decorative ruled-paper background (horizontal rules + the red margin line). Never announced. */
export function NotebookRule({ height, step = 28, marginX = 28, style }: { height: number; step?: number; /** x of the red margin line; null hides it */ marginX?: number | null; style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  const rows = Math.ceil(height / step);
  return (
    <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, { height }, style]}>
      <Svg width="100%" height={height}>
        {Array.from({ length: rows }, (_, i) => (
          <Line key={i} x1="0" x2="100%" y1={(i + 1) * step} y2={(i + 1) * step} stroke={p.rule} strokeWidth={1} />
        ))}
        {marginX !== null ? <Line x1={marginX} x2={marginX} y1="0" y2={height} stroke={p.margin} strokeWidth={1.5} /> : null}
      </Svg>
    </View>
  );
}

/** The app mark: a square of exercise-book paper with a blue-ink tick. Pure vector, adapts to the scheme. */
export function BrandMark({ size = 56 }: { size?: number }) {
  const p = usePalette();
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessible={false}>
      <Rect x="0" y="0" width="64" height="64" rx="17" fill={p.brandFill} />
      <Line x1="0" x2="64" y1="22" y2="22" stroke="#FFFFFF" strokeOpacity={0.16} strokeWidth={1.5} />
      <Line x1="0" x2="64" y1="34" y2="34" stroke="#FFFFFF" strokeOpacity={0.16} strokeWidth={1.5} />
      <Line x1="0" x2="64" y1="46" y2="46" stroke="#FFFFFF" strokeOpacity={0.16} strokeWidth={1.5} />
      <Line x1="15" x2="15" y1="0" y2="64" stroke="#F4A79D" strokeOpacity={0.9} strokeWidth={2} />
      <Path d="M23 33.5 L30.5 41 L46 24.5" stroke="#FFFFFF" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.l, borderWidth: hairline, overflow: 'hidden' },
  cardPad: { padding: space.m },
  badge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'flex-start', gap: 5, maxWidth: '100%', borderRadius: radius.xs, paddingHorizontal: 7, paddingVertical: 2 },
  stat: { flex: 1, minWidth: 0, borderRadius: radius.l, borderWidth: hairline, paddingVertical: space.s, paddingHorizontal: space.m, gap: 2 },
  seg: { flexDirection: 'row', borderRadius: radius.m - 2, padding: 3 },
  segItem: { flex: 1, minHeight: 36, borderRadius: radius.s, paddingVertical: 7, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
});
