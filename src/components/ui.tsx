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
  type TextStyle,
  type ViewStyle,
  useWindowDimensions,
} from 'react-native';
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
export function Txt({ v = 'body', color, style, ...rest }: TextProps & { v?: Variant; color?: string; style?: StyleProp<TextStyle> }) {
  const p = usePalette();
  return <Text {...rest} style={[type[v], { color: color ?? p.ink }, style]} />;
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
        <View style={[styles.rowIcon, { backgroundColor: p.fill }]}>
          <Text style={{ fontSize: 19 }}>{icon}</Text>
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
      {chevron ? (
        <Txt v="headline" color={p.muted} style={{ marginLeft: 4 }}>
          ›
        </Txt>
      ) : null}
    </View>
  );
  if (!onPress || disabled) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && { backgroundColor: p.fill }]}>
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
          value={value}
          onValueChange={(v) => {
            haptic.tap();
            onChange(v);
          }}
          trackColor={{ true: p.brand, false: p.line }}
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
  const bg = kind === 'secondary' ? p.brandSoft : kind === 'plain' ? p.fill : kind === 'ok' ? p.ok : kind === 'bad' ? p.bad : undefined;
  const pad = small ? styles.btnSmall : styles.btnBig;
  const inner = loading ? (
    <ActivityIndicator color={fg} />
  ) : (
    <Txt v={small ? 'sub' : 'headline'} color={fg} style={{ textAlign: 'center', fontFamily: type.headline.fontFamily }}>
      {icon ? `${icon}  ` : ''}
      {title}
    </Txt>
  );
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress();
      }}
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
      accessibilityLabel={label}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      hitSlop={8}
      style={({ pressed }) => [styles.iconBtn, { backgroundColor: p.card, shadowColor: p.shadow, transform: [{ scale: pressed ? 0.92 : 1 }] }]}
    >
      <Text style={{ fontSize: 18 }}>{icon}</Text>
    </Pressable>
  );
}

// ---------- chips ----------
export function Chip({ label, selected, onPress, tone }: { label: string; selected?: boolean; onPress?: () => void; tone?: 'muted' }) {
  const p = usePalette();
  return (
    <Pressable
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
        { backgroundColor: selected ? p.brand : tone === 'muted' ? p.fill : p.card, borderColor: selected ? p.brand : p.line, transform: [{ scale: pressed ? 0.95 : 1 }] },
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
        {...rest}
        style={[type.body, styles.input, { backgroundColor: p.card, color: p.ink, borderColor: p.line }, style]}
      />
    </View>
  );
}

// clamp: stay within one day (00:00–23:45) instead of wrapping past midnight
export function TimeStepper({ value, onChange, step = 15, clamp }: { value: string; onChange: (v: string) => void; step?: number; clamp?: boolean }) {
  const p = usePalette();
  const t = useT();
  const m = toMin(value);
  const btn = (d: number, label: string) => (
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
      <Txt v="headline">{label}</Txt>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {btn(-step, '−')}
      <Txt v="headline" style={{ minWidth: 54, textAlign: 'center', fontVariant: ['tabular-nums'] }}>
        {value}
      </Txt>
      {btn(step, '+')}
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
          <View style={[styles.grip, { backgroundColor: p.line }]} />
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Txt v="title" style={{ flex: 1 }}>
              {title}
            </Txt>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')} style={[styles.close, { backgroundColor: p.fill }]}>
              <Txt v="sub" color={p.muted}>
                ✕
              </Txt>
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
        >
          <Txt v="headline" color={p.brand === '#6355F5' ? '#B7AEFF' : p.brand}>
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
      <Text style={{ fontSize: 44 }}>{icon}</Text>
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
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: p.bg, padding: 24 }}>
      {error ? (
        <Empty icon="📡" title={error}>
          {onRetry ? <Btn title={t('common.retry')} onPress={onRetry} style={{ marginTop: 16 }} /> : null}
        </Empty>
      ) : (
        <ActivityIndicator color={p.brand} size="large" />
      )}
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
  btnSmall: { paddingVertical: 9, paddingHorizontal: 14, minHeight: 38 },
  iconBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  chip: { borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { borderRadius: radius.m, paddingHorizontal: 14, paddingVertical: 13, borderWidth: 1 },
  step: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  emoji: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: 18, paddingTop: 10 },
  grip: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 12 },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  toast: { position: 'absolute', left: 16, right: 16, borderRadius: radius.m, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  empty: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 20 },
});
