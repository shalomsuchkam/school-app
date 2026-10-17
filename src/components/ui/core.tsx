import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { createContext, useContext } from 'react';
import { Text, type ColorValue, type StyleProp, type TextProps, type TextStyle } from 'react-native';

import { type, usePalette } from '@/lib/theme';

// One haptic per user action, always paired with a visual change.
export const haptic = {
  tap: () => Haptics.selectionAsync().catch(() => {}),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  warn: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
};

// ---------- text ----------
export type Variant = keyof typeof type;
// Dynamic Type: text follows the system font size, capped so large titles and dense rows keep their layout.
export const MAX_SCALE: Record<Variant, number> = { display: 1.2, largeTitle: 1.3, title: 1.4, headline: 1.5, label: 1.4, body: 1.6, callout: 1.6, sub: 1.6, caps: 1.4 };
// In-app text size on top of Dynamic Type (the child's "large text" setting). The Dynamic Type cap shrinks by
// the same factor, so the combined size never exceeds what the layout was designed for.
export const TextScale = createContext(1);
export function Txt({ v = 'body', color, style, ...rest }: TextProps & { v?: Variant; color?: string; style?: StyleProp<TextStyle> }) {
  const p = usePalette();
  const k = useContext(TextScale);
  const base = type[v];
  const scaled = k !== 1 ? { fontSize: Math.round(base.fontSize * k), lineHeight: Math.round(base.lineHeight * k) } : null;
  return <Text maxFontSizeMultiplier={Math.max(1, MAX_SCALE[v] / k)} {...rest} style={[base, scaled, { color: color ?? p.ink }, style]} />;
}

// ---------- icons ----------
// UI chrome uses Ionicons (filled = selected/strong, outline = idle); user-chosen content (subject / item emoji) stays emoji.
export type IconName = keyof typeof Ionicons.glyphMap;
export const isIconName = (s: string): s is IconName => Object.prototype.hasOwnProperty.call(Ionicons.glyphMap, s);
export function Icon({ name, size = 20, color, style }: { name: IconName; size?: number; color?: ColorValue; style?: StyleProp<TextStyle> }) {
  const p = usePalette();
  return <Ionicons name={name} size={size} color={color ?? p.ink} style={style} allowFontScaling={false} accessible={false} importantForAccessibility="no" />;
}
// Legacy symbol icons passed as text by screens map to the matching Ionicon.
export const SYMBOL_ICONS: Record<string, IconName> = { '＋': 'add', '+': 'add', '➕': 'add', '←': 'chevron-back', '→': 'chevron-forward', '✕': 'close', '×': 'close', '↗': 'share-outline' };
export const iconOf = (icon: string): IconName | undefined => (isIconName(icon) ? icon : SYMBOL_ICONS[icon]);
// An Ionicons name (or a legacy symbol) renders as an icon; anything else (emoji) renders as text.
export function Glyph({ icon, size, color }: { icon: string; size: number; color: string }) {
  const name = iconOf(icon);
  if (name) return <Icon name={name} size={size} color={color} />;
  return (
    <Text style={{ fontSize: size, lineHeight: Math.round(size * 1.25), color }} maxFontSizeMultiplier={1.2} accessible={false} importantForAccessibility="no">
      {icon}
    </Text>
  );
}
