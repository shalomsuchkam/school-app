import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated as RNAnimated,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ColorValue,
  type DimensionValue,
  type TextStyle,
  type ViewStyle,
  useWindowDimensions,
} from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { KeyboardAvoidingView, useKeyboardState } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fromMin, toMin, wdShort } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { gradients, radius, type, usePalette } from '@/lib/theme';

export const haptic = {
  tap: () => Haptics.selectionAsync().catch(() => {}),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  warn: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
};

// ---------- text ----------
type Variant = keyof typeof type;
// Dynamic Type: text follows the system font size, capped so large titles and dense rows keep their layout.
const MAX_SCALE: Record<Variant, number> = { largeTitle: 1.3, title: 1.4, headline: 1.5, body: 1.6, callout: 1.6, sub: 1.6, caps: 1.4 };
export function Txt({ v = 'body', color, style, ...rest }: TextProps & { v?: Variant; color?: string; style?: StyleProp<TextStyle> }) {
  const p = usePalette();
  return <Text maxFontSizeMultiplier={MAX_SCALE[v]} {...rest} style={[type[v], { color: color ?? p.ink }, style]} />;
}

// ---------- icons ----------
// UI chrome uses Ionicons; user-chosen content (subject / item emoji) stays emoji.
export type IconName = keyof typeof Ionicons.glyphMap;
export const isIconName = (s: string): s is IconName => Object.prototype.hasOwnProperty.call(Ionicons.glyphMap, s);
export function Icon({ name, size = 20, color, style }: { name: IconName; size?: number; color?: ColorValue; style?: StyleProp<TextStyle> }) {
  const p = usePalette();
  return <Ionicons name={name} size={size} color={color ?? p.ink} style={style} allowFontScaling={false} accessible={false} importantForAccessibility="no" />;
}
// Legacy symbol icons passed as text by screens map to the matching Ionicon.
const SYMBOL_ICONS: Record<string, IconName> = { '＋': 'add', '+': 'add', '➕': 'add', '←': 'chevron-back', '→': 'chevron-forward', '✕': 'close', '×': 'close', '↗': 'share-outline' };
// An Ionicons name (or a legacy symbol) renders as an icon; anything else (emoji) renders as text.
function Glyph({ icon, size, color }: { icon: string; size: number; color: string }) {
  const name = isIconName(icon) ? icon : SYMBOL_ICONS[icon];
  if (name) return <Icon name={name} size={size} color={color} />;
  return (
    <Text style={{ fontSize: size, lineHeight: Math.round(size * 1.25), color }} maxFontSizeMultiplier={1.2} accessible={false} importantForAccessibility="no">
      {icon}
    </Text>
  );
}

// ---------- skeleton ----------
// A placeholder block that pulses on the UI thread; static when the system asks for reduced motion.
export function Skeleton({ width = '100%', height = 14, r = 8, style }: { width?: DimensionValue; height?: DimensionValue; r?: number; style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (reduced) {
      cancelAnimation(pulse);
      pulse.set(0);
      return;
    }
    pulse.set(withRepeat(withTiming(1, { duration: 850, easing: Easing.inOut(Easing.quad) }), -1, true));
    return () => cancelAnimation(pulse);
  }, [reduced, pulse]);
  const anim = useAnimatedStyle(() => ({ opacity: 1 - pulse.get() * 0.5 }));
  return <Animated.View style={[{ width, height, borderRadius: r, backgroundColor: p.fill }, anim, style]} />;
}

// ---------- adaptive layout ----------
// Phones keep the full width; tablets, unfolded foldables and landscape get a centred column of readable width.
export const CONTENT_MAX = 720;
export function useLayout() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= 700;
  const pad = width >= 600 ? 24 : 16;
  return { width, wide, pad: Math.max(pad, insets.left + 8, insets.right + 8) };
}

// ---------- screen with a large title ----------
export function Screen({
  title,
  subtitle,
  right,
  children,
  onRefresh,
  footer,
}: {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  onRefresh?: () => Promise<void>;
  footer?: ReactNode;
}) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const { pad } = useLayout();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    await onRefresh().catch(() => {});
    setRefreshing(false);
  };
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: pad, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 110, width: '100%', maxWidth: CONTENT_MAX + pad * 2, alignSelf: 'center' }}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={p.brand} /> : undefined}
      >
        {title ? (
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Txt v="largeTitle">{title}</Txt>
              {subtitle ? (
                <Txt v="callout" color={p.muted} style={{ marginTop: 2 }}>
                  {subtitle}
                </Txt>
              ) : null}
            </View>
            {right}
          </View>
        ) : null}
        {children}
      </ScrollView>
      {footer}
    </View>
  );
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const p = usePalette();
  return (
    <View style={styles.sectionRow}>
      <Txt v="caps" color={p.muted} style={{ flex: 1, textTransform: 'uppercase' }}>
        {children}
      </Txt>
      {right}
    </View>
  );
}

// ---------- grouped list ----------
export function Group({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  const items = (Array.isArray(children) ? children : [children]).flat().filter(Boolean);
  return (
    <View style={[styles.group, { backgroundColor: p.card, shadowColor: p.shadow }, style]}>
      {items.map((c, i) => (
        <View key={i}>
          {i > 0 ? <View style={[styles.hair, { backgroundColor: p.line }]} /> : null}
          {c}
        </View>
      ))}
    </View>
  );
}

export function Row({
  icon,
  title,
  subtitle,
  right,
  onPress,
  danger,
  chevron,
  disabled,
}: {
  icon?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  danger?: boolean;
  chevron?: boolean;
  disabled?: boolean;
}) {
  const p = usePalette();
  const body = (
    <View style={[styles.row, disabled && { opacity: 0.45 }]}>
      {icon ? (
        <View style={[styles.rowIcon, { backgroundColor: isIconName(icon) ? p.brandSoft : p.fill }]}>
          <Glyph icon={icon} size={19} color={danger ? p.bad : p.brand} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Txt v="body" color={danger ? p.bad : p.ink} numberOfLines={2}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt v="sub" color={p.muted} style={{ marginTop: 1 }} numberOfLines={2}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {right}
      {chevron ? <Icon name="chevron-forward" size={18} color={p.muted} style={{ marginLeft: 2 }} /> : null}
    </View>
  );
  if (!onPress || disabled) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [pressed && { backgroundColor: p.fill }]}>
      {body}
    </Pressable>
  );
}

export function ToggleRow({ icon, title, subtitle, value, onChange }: { icon?: string; title: string; subtitle?: string; value: boolean; onChange: (v: boolean) => void }) {
  const p = usePalette();
  return (
    <Row
      icon={icon}
      title={title}
      subtitle={subtitle}
      right={
        <Switch
          accessibilityRole="switch"
          accessibilityLabel={title}
          accessibilityHint={subtitle}
          accessibilityState={{ checked: value }}
          value={value}
          onValueChange={(v) => {
            haptic.tap();
            onChange(v);
          }}
          trackColor={{ true: p.brandFill, false: p.border }}
          thumbColor="#fff"
        />
      }
    />
  );
}

// ---------- buttons ----------
type BtnKind = 'primary' | 'secondary' | 'plain' | 'ok' | 'bad';
export function Btn({
  title,
  onPress,
  kind = 'primary',
  small,
  disabled,
  loading,
  style,
  icon,
}: {
  title: string;
  onPress: () => void;
  kind?: BtnKind;
  small?: boolean;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  icon?: string;
}) {
  const p = usePalette();
  const fg = kind === 'secondary' ? p.brand : kind === 'plain' ? p.ink : '#fff';
  const tv = small ? 'sub' : 'headline';
  const bg = kind === 'secondary' ? p.brandSoft : kind === 'plain' ? p.fill : kind === 'ok' ? p.ok : kind === 'bad' ? p.bad : undefined;
  const pad = small ? styles.btnSmall : styles.btnBig;
  const inner = loading ? (
    <ActivityIndicator color={fg} />
  ) : (
    <View style={styles.btnInner}>
      {icon ? <Glyph icon={icon} size={small ? 16 : 19} color={fg} /> : null}
      <Txt v={tv} color={fg} style={{ textAlign: 'center', fontFamily: type.headline.fontFamily, flexShrink: 1 }}>
        {title}
      </Txt>
    </View>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      // small buttons are 40pt tall: the slop keeps the touch target ≥ 44pt
      hitSlop={small ? 4 : undefined}
      disabled={disabled || loading}
      style={({ pressed }) => [{ opacity: disabled ? 0.45 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] }, style]}
    >
      {kind === 'primary' ? (
        <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.btn, pad]}>
          {inner}
        </LinearGradient>
      ) : (
        <View style={[styles.btn, pad, { backgroundColor: bg }]}>{inner}</View>
      )}
    </Pressable>
  );
}

export function IconBtn({ icon, onPress, label }: { icon: string; onPress: () => void; label: string }) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      hitSlop={8}
      style={({ pressed }) => [styles.iconBtn, { backgroundColor: p.card, shadowColor: p.shadow, transform: [{ scale: pressed ? 0.92 : 1 }] }]}
    >
      <Glyph icon={icon} size={isIconName(icon) || SYMBOL_ICONS[icon] ? 22 : 18} color={p.ink} />
    </Pressable>
  );
}

// ---------- chips ----------
export function Chip({ label, selected, onPress, tone }: { label: string; selected?: boolean; onPress?: () => void; tone?: 'muted' }) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={label}
      accessibilityState={onPress ? { selected: !!selected } : undefined}
      hitSlop={onPress ? 4 : undefined}
      onPress={
        onPress
          ? () => {
              haptic.tap();
              onPress();
            }
          : undefined
      }
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: selected ? p.brandFill : tone === 'muted' ? p.fill : p.card, borderColor: selected ? p.brandFill : tone === 'muted' ? p.fill : p.border, transform: [{ scale: pressed ? 0.95 : 1 }] },
      ]}
    >
      <Txt v="callout" color={selected ? '#fff' : p.ink}>
        {label}
      </Txt>
    </Pressable>
  );
}

export function WeekdayPicker({ value, onChange, only }: { value: number[]; onChange: (v: number[]) => void; only?: number[] }) {
  useT(); // re-render with the new weekday names when the language changes
  const days = only ?? [1, 2, 3, 4, 5, 6, 7];
  return (
    <View style={styles.wrap}>
      {days.map((d) => {
        const on = value.includes(d);
        return <Chip key={d} label={wdShort(d)} selected={on} onPress={() => onChange(on ? value.filter((x) => x !== d) : [...value, d].sort())} />;
      })}
    </View>
  );
}

// ---------- inputs ----------
export function Field(props: TextInputProps & { label?: string }) {
  const p = usePalette();
  const { label, style, ...rest } = props;
  return (
    <View style={{ marginBottom: 12 }}>
      {label ? (
        <Txt v="sub" color={p.muted} style={{ marginBottom: 6, marginLeft: 4 }}>
          {label}
        </Txt>
      ) : null}
      <TextInput
        placeholderTextColor={p.muted}
        maxFontSizeMultiplier={MAX_SCALE.body}
        accessibilityLabel={label}
        {...rest}
        style={[type.body, styles.input, { backgroundColor: p.card, color: p.ink, borderColor: p.border }, style]}
      />
    </View>
  );
}

// clamp: stay within one day (00:00–23:45) instead of wrapping past midnight
export function TimeStepper({ value, onChange, step = 15, clamp }: { value: string; onChange: (v: string) => void; step?: number; clamp?: boolean }) {
  const p = usePalette();
  const t = useT();
  const m = toMin(value);
  const btn = (d: number, name: IconName) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(d < 0 ? 'ui.earlier' : 'ui.later')}
      onPress={() => {
        const next = clamp ? Math.min(1440 - step, Math.max(0, m + d)) : m + d;
        if (next === m) {
          haptic.warn();
          return;
        }
        haptic.tap();
        onChange(fromMin(next));
      }}
      hitSlop={6}
      style={({ pressed }) => [styles.step, { backgroundColor: p.fill, transform: [{ scale: pressed ? 0.9 : 1 }] }]}
    >
      <Icon name={name} size={20} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {btn(-step, 'remove')}
      <Txt v="headline" style={{ minWidth: 54, textAlign: 'center', fontVariant: ['tabular-nums'] }}>
        {value}
      </Txt>
      {btn(step, 'add')}
    </View>
  );
}

export function EmojiPicker({ value, onChange, options }: { value: string; onChange: (e: string) => void; options: string[] }) {
  const p = usePalette();
  return (
    <View style={styles.wrap}>
      {options.map((e) => (
        <Pressable
          key={e}
          accessibilityRole="button"
          accessibilityLabel={e}
          accessibilityState={{ selected: e === value }}
          onPress={() => {
            haptic.tap();
            onChange(e);
          }}
          style={[styles.emoji, { backgroundColor: e === value ? p.brandSoft : p.fill, borderColor: e === value ? p.brand : 'transparent' }]}
        >
          <Text style={{ fontSize: 22 }}>{e}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ---------- bottom sheet ----------
// `overlay` is rendered last inside the Modal (e.g. a toast), so it shows above the sheet.
export function Sheet({
  visible,
  title,
  onClose,
  children,
  overlay,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  overlay?: ReactNode;
}) {
  const p = usePalette();
  const t = useT();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: p.scrim }]} onPress={onClose} />
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'flex-end' }} pointerEvents="box-none">
        <View style={[styles.sheet, { backgroundColor: p.bgElevated, paddingBottom: insets.bottom + 16, width: '100%', maxWidth: 600, alignSelf: 'center' }]}>
          <View style={[styles.grip, { backgroundColor: p.border }]} />
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Txt v="title" accessibilityRole="header" style={{ flex: 1 }}>
              {title}
            </Txt>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')} style={[styles.close, { backgroundColor: p.fill }]}>
              <Icon name="close" size={18} color={p.muted} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 560 }} showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
      {overlay}
    </Modal>
  );
}

// ---------- toast with optional action (undo) ----------
export function useToast() {
  const [state, setState] = useState<{ msg: string; action?: { label: string; run: () => void } } | null>(null);
  const [opacity] = useState(() => new RNAnimated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hide = () =>
    // a show() during the fade-out stops it (finished=false): keep the new toast then
    RNAnimated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(({ finished }) => finished && setState(null));
  const show = (msg: string, action?: { label: string; run: () => void }) => {
    setState({ msg, action });
    RNAnimated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(hide, action ? 4500 : 2600);
  };
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const node = state ? <ToastView opacity={opacity} msg={state.msg} action={state.action} onAction={hide} /> : null;
  return { show, node };
}
function ToastView({ opacity, msg, action, onAction }: { opacity: RNAnimated.Value; msg: string; action?: { label: string; run: () => void }; onAction: () => void }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  // inside a Sheet the keyboard may be open: keep the toast above it
  const kb = useKeyboardState((k) => (k.isVisible ? k.height : 0));
  return (
    <RNAnimated.View pointerEvents="box-none" style={[styles.toast, { opacity, bottom: Math.max(insets.bottom + 92, kb + 16), backgroundColor: p.ink }]}>
      <Txt v="callout" color={p.bg} style={{ flex: 1 }}>
        {msg}
      </Txt>
      {action ? (
        <Pressable
          onPress={() => {
            onAction(); // hide first: a toast shown by run() then replaces this one instead of fading out with it
            action.run();
          }}
          hitSlop={10}
          accessibilityRole="button"
        >
          <Txt v="headline" color={p.onInkAccent}>
            {action.label}
          </Txt>
        </Pressable>
      ) : null}
    </RNAnimated.View>
  );
}

export function Empty({ icon, title, text, children }: { icon: string; title: string; text?: string; children?: ReactNode }) {
  const p = usePalette();
  return (
    <View style={styles.empty}>
      {isIconName(icon) ? (
        <View style={[styles.emptyIcon, { backgroundColor: p.brandSoft }]}>
          <Icon name={icon} size={34} color={p.brand} />
        </View>
      ) : (
        <Text style={{ fontSize: 44 }} maxFontSizeMultiplier={1.2} accessible={false} importantForAccessibility="no">
          {icon}
        </Text>
      )}
      <Txt v="headline" style={{ marginTop: 10, textAlign: 'center' }}>
        {title}
      </Txt>
      {text ? (
        <Txt v="callout" color={p.muted} style={{ marginTop: 6, textAlign: 'center' }}>
          {text}
        </Txt>
      ) : null}
      {children}
    </View>
  );
}

export function Loading({ error, onRetry }: { error?: string | null; onRetry?: () => void }) {
  const p = usePalette();
  const t = useT();
  if (error) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: p.bg, padding: 24 }}>
        <Empty icon="cloud-offline-outline" title={error}>
          {onRetry ? <Btn title={t('common.retry')} icon="refresh" onPress={onRetry} style={{ marginTop: 16 }} /> : null}
        </Empty>
      </View>
    );
  }
  return <LoadingSkeleton label={t('common.loading')} />;
}

// Mirrors a typical Screen: large title, a hero card and a grouped list of rows.
function LoadingSkeleton({ label }: { label: string }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const { pad } = useLayout();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      style={{ flex: 1, backgroundColor: p.bg }}
    >
      <View style={{ paddingHorizontal: pad, paddingTop: insets.top + 12, width: '100%', maxWidth: CONTENT_MAX + pad * 2, alignSelf: 'center' }}>
        <View style={[styles.header, { alignItems: 'center' }]}>
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width="58%" height={32} r={10} />
            <Skeleton width="36%" height={14} />
          </View>
          <Skeleton width={44} height={44} r={22} />
        </View>
        <Skeleton height={132} r={radius.l} />
        <Skeleton width="28%" height={12} r={6} style={{ marginTop: 26, marginBottom: 10, marginLeft: 6 }} />
        <View style={[styles.group, { backgroundColor: p.card, shadowColor: p.shadow }]}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i}>
              {i > 0 ? <View style={[styles.hair, { backgroundColor: p.line }]} /> : null}
              <View style={styles.row}>
                <Skeleton width={34} height={34} r={10} />
                <View style={{ flex: 1, gap: 7 }}>
                  <Skeleton width={i % 2 ? '52%' : '68%'} height={14} />
                  <Skeleton width={i % 2 ? '34%' : '42%'} height={11} />
                </View>
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 16, gap: 10 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', marginTop: 22, marginBottom: 8, paddingHorizontal: 6 },
  group: {
    borderRadius: radius.l,
    overflow: 'hidden',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  hair: { height: StyleSheet.hairlineWidth, marginLeft: 60 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 56 },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btn: { borderRadius: radius.m, alignItems: 'center', justifyContent: 'center' },
  btnBig: { paddingVertical: 15, paddingHorizontal: 20, minHeight: 52 },
  btnSmall: { paddingVertical: 9, paddingHorizontal: 14, minHeight: 40 },
  btnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  chip: { borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { borderRadius: radius.m, paddingHorizontal: 14, paddingVertical: 13, borderWidth: 1 },
  step: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  emoji: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: 18, paddingTop: 10 },
  grip: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 12 },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  toast: { position: 'absolute', left: 16, right: 16, borderRadius: radius.m, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  empty: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 20 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
});
