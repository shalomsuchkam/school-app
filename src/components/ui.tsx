/*
 * Design-system primitives («Тетрадь»; tokens and rationale live at the top of src/lib/theme.ts).
 * Build new screens from these; reach for raw View/Text only for one-off layout.
 *
 *  Text & icons   Txt (type scale + Dynamic Type caps) · Icon (Ionicons) · Glyph (icon name or emoji) · haptic
 *  Layout         Screen (large title, refresh, centred CONTENT_MAX column) · useLayout · CONTENT_MAX
 *  Lists          SectionLabel · Group (inset grouped list, hairlines inset to the text) ·
 *                 Row (icon tile, title, subtitle, value, chevron; `tint` = iOS-style solid tile) · ToggleRow
 *  Surfaces       Card (hairline page, optional status tone) · Banner (info/warn/bad + action) · Badge ·
 *                 IconTile · Stat · ProgressBar · SegmentBar · NotebookRule · BrandMark
 *  Controls       Btn (primary | secondary | plain | ghost | ok | bad, small) · IconBtn · Chip · Segmented ·
 *                 Field · TimeStepper · DateField · WeekdayPicker · EmojiPicker · PressableScale
 *  Overlays       Sheet (spring in, drag/flick to dismiss, Reduce Motion = fade) · useToast (with undo)
 *  States         Skeleton · Loading (skeleton or error + retry) · ErrorBanner · Empty
 *  Motion         motion tokens + EASE_OUT (./ui/motion)
 *
 * Rules: brand colour is an accent (primary action, selection, progress); status colours come from
 * `tone`; one primary button per view; touch targets ≥ 44 pt (hitSlop where the visual is smaller).
 */
import { Children, isValidElement, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated as RNAnimated,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type DimensionValue,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
  useWindowDimensions,
} from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardAvoidingView, useKeyboardState } from 'react-native-keyboard-controller';
import Animated, { cancelAnimation, Easing, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { fromMin, shortDate, toMin, wdShort } from '@/lib/format';
import { getLang, useT } from '@/lib/i18n';
import { elevation, hairline, radius, space, type as typeScale, usePalette, type TileColor } from '@/lib/theme';

import { Glyph, haptic, Icon, iconOf, isIconName, MAX_SCALE, Txt, type IconName } from './ui/core';
import { motion, PressableScale } from './ui/motion';
import { IconTile, toneColors, type Tone } from './ui/surfaces';

export * from './ui/core';
export * from './ui/motion';
export * from './ui/surfaces';

// ---------- skeleton ----------
// A placeholder block that breathes on the UI thread; static when the system asks for reduced motion.
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
    pulse.set(withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true));
    return () => cancelAnimation(pulse);
  }, [reduced, pulse]);
  const anim = useAnimatedStyle(() => ({ opacity: 1 - pulse.get() * 0.45 }));
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
  eyebrow,
  right,
  children,
  onRefresh,
  footer,
}: {
  title?: string;
  subtitle?: string;
  /** Small line above the title (e.g. the date above a child's name). */
  eyebrow?: string;
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
        contentContainerStyle={{ paddingHorizontal: pad, paddingTop: insets.top + space.s, paddingBottom: insets.bottom + 112, width: '100%', maxWidth: CONTENT_MAX + pad * 2, alignSelf: 'center' }}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={p.brand} colors={[p.brandFill]} /> : undefined}
      >
        {title ? (
          <View style={styles.header}>
            <View style={{ flex: 1, minWidth: 0 }}>
              {eyebrow ? (
                <Txt v="sub" color={p.muted} style={{ fontWeight: '600', marginBottom: 2 }}>
                  {eyebrow}
                </Txt>
              ) : null}
              <Txt v="largeTitle" accessibilityRole="header">
                {title}
              </Txt>
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

// Sentence-case group label in the iOS grouped-list position; `right` holds a small action.
export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const p = usePalette();
  return (
    <View style={styles.sectionRow}>
      <Txt v="sub" color={p.muted} accessibilityRole="header" style={{ flex: 1, fontWeight: '600' }}>
        {children}
      </Txt>
      {right}
    </View>
  );
}

// ---------- grouped list ----------
// Hairlines start at the text column: past the icon tile when the row has one.
export function Group({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.group, { backgroundColor: p.card, borderColor: p.line }, style]}>
      {items.map((c, i) => {
        const prev = items[i - 1];
        const inset = isValidElement<{ icon?: string }>(prev) && prev.props.icon ? 60 : space.m;
        return (
          <View key={isValidElement(c) && c.key != null ? c.key : i}>
            {i > 0 ? <View style={[styles.hair, { backgroundColor: p.line, marginLeft: inset }]} /> : null}
            {c}
          </View>
        );
      })}
    </View>
  );
}

export function Row({
  icon,
  tint,
  title,
  subtitle,
  value,
  right,
  onPress,
  danger,
  chevron,
  disabled,
  selected,
}: {
  /** One option of a pick-one list (announced as selected). */
  selected?: boolean;
  /** Ionicons name, legacy symbol or a user-chosen emoji. */
  icon?: string;
  /** Solid tile colour with a white glyph (Settings style). Without it, icons sit on a soft brand tile. */
  tint?: TileColor;
  title: string;
  subtitle?: string;
  /** Short detail text on the right (current value). */
  value?: string;
  right?: ReactNode;
  onPress?: () => void;
  danger?: boolean;
  chevron?: boolean;
  disabled?: boolean;
}) {
  const p = usePalette();
  const body = (
    <View style={[styles.row, disabled && { opacity: 0.45 }]}>
      {icon ? <IconTile icon={icon} color={danger ? 'red' : tint} tone={danger ? 'bad' : 'brand'} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="body" color={danger ? p.bad : p.ink} numberOfLines={2} style={danger ? { fontWeight: '500' } : undefined}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt v="sub" color={p.muted} style={{ marginTop: 1 }} numberOfLines={2}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {value ? (
        <Txt v="callout" color={p.muted} numberOfLines={1} style={{ maxWidth: '40%' }}>
          {value}
        </Txt>
      ) : null}
      {right}
      {chevron ? <Icon name="chevron-forward" size={17} color={p.border} style={{ marginLeft: -2 }} /> : null}
    </View>
  );
  if (!onPress || disabled) return body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={selected !== undefined ? { selected } : undefined}
      style={({ pressed }) => [pressed && { backgroundColor: p.fill }]}
    >
      {body}
    </Pressable>
  );
}

export function ToggleRow({ icon, tint, title, subtitle, value, onChange }: { icon?: string; tint?: TileColor; title: string; subtitle?: string; value: boolean; onChange: (v: boolean) => void }) {
  const p = usePalette();
  return (
    <Row
      icon={icon}
      tint={tint}
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
          trackColor={{ true: p.okFill, false: p.border }}
          thumbColor="#fff"
          ios_backgroundColor={p.border}
          // react-native-web colours the thumb with its own prop
          {...(Platform.OS === 'web' ? { activeThumbColor: '#fff' } : null)}
        />
      }
    />
  );
}

// ---------- banners ----------
// Inline status with an optional action: offline, permission needed, overdue. Not a modal.
export function Banner({ tone = 'warn', icon, title, text, action, live }: { tone?: Tone; icon?: IconName; title?: string; text?: string; action?: { label: string; onPress: () => void; icon?: string }; live?: boolean }) {
  const p = usePalette();
  const c = toneColors(p, tone);
  return (
    <View accessibilityRole={tone === 'bad' ? 'alert' : undefined} accessibilityLiveRegion={live ? 'polite' : undefined} style={[styles.banner, { backgroundColor: c.soft }]}>
      <View style={styles.bannerRow}>
        {icon ? <Icon name={icon} size={20} color={c.fg} style={{ marginTop: 1 }} /> : null}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          {title ? (
            <Txt v="headline" color={tone === 'neutral' ? p.ink : c.fg}>
              {title}
            </Txt>
          ) : null}
          {text ? <Txt v="callout" color={p.ink}>{text}</Txt> : null}
        </View>
      </View>
      {action ? <Btn small kind={tone === 'bad' ? 'bad' : 'primary'} icon={action.icon} title={action.label} onPress={action.onPress} style={{ alignSelf: 'flex-start', marginLeft: icon ? 30 : 0 }} /> : null}
    </View>
  );
}

// ---------- buttons ----------
type BtnKind = 'primary' | 'secondary' | 'plain' | 'ghost' | 'ok' | 'bad';
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
  const fg = kind === 'secondary' || kind === 'ghost' ? p.brand : kind === 'plain' ? p.ink : '#fff';
  const bg = { primary: p.brandFill, secondary: p.brandSoft, plain: p.fill, ghost: 'transparent', ok: p.okFill, bad: p.badFill }[kind];
  const inner = loading ? (
    <ActivityIndicator color={fg} />
  ) : (
    <View style={styles.btnInner}>
      {icon ? <Glyph icon={icon} size={small ? 16 : 19} color={fg} /> : null}
      <Txt v={small ? 'callout' : 'label'} color={fg} style={{ textAlign: 'center', fontWeight: '600', flexShrink: 1 }}>
        {title}
      </Txt>
    </View>
  );
  return (
    <PressableScale
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
      style={[styles.btn, small ? styles.btnSmall : styles.btnBig, { backgroundColor: bg, opacity: disabled ? 0.4 : 1 }, style]}
    >
      {inner}
    </PressableScale>
  );
}

export function IconBtn({ icon, onPress, label }: { icon: string; onPress: () => void; label: string }) {
  const p = usePalette();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      hitSlop={8}
      scaleTo={0.92}
      style={[styles.iconBtn, { backgroundColor: p.card, borderColor: p.line }]}
    >
      <Glyph icon={icon} size={iconOf(icon) ? 21 : 18} color={p.ink} />
    </PressableScale>
  );
}

// ---------- chips ----------
export function Chip({ label, selected, onPress, tone, icon, trailingIcon }: { label: string; selected?: boolean; onPress?: () => void; tone?: 'muted'; icon?: IconName; trailingIcon?: IconName }) {
  const p = usePalette();
  const fg = selected ? '#fff' : p.ink;
  return (
    <PressableScale
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={label}
      accessibilityState={onPress ? { selected: !!selected } : undefined}
      hitSlop={onPress ? 4 : undefined}
      disabled={!onPress}
      scaleTo={0.95}
      onPress={
        onPress
          ? () => {
              haptic.tap();
              onPress();
            }
          : undefined
      }
      style={[styles.chip, { backgroundColor: selected ? p.brandFill : tone === 'muted' ? p.fill : p.card, borderColor: selected ? p.brandFill : tone === 'muted' ? p.fill : p.line }]}
    >
      {icon ? <Icon name={icon} size={16} color={selected ? fg : p.brand} /> : null}
      <Txt v="callout" color={fg} style={{ fontWeight: selected ? '600' : '500' }}>
        {label}
      </Txt>
      {trailingIcon ? <Icon name={trailingIcon} size={15} color={selected ? fg : p.muted} /> : null}
    </PressableScale>
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
  const { label, style, onFocus, onBlur, ...rest } = props;
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginBottom: space.s }}>
      {label ? (
        <Txt v="sub" color={p.ink2} style={{ marginBottom: 6, marginLeft: 2, fontWeight: '600' }}>
          {label}
        </Txt>
      ) : null}
      <TextInput
        placeholderTextColor={p.muted}
        maxFontSizeMultiplier={MAX_SCALE.body}
        accessibilityLabel={label}
        selectionColor={p.brand}
        cursorColor={p.brand}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...rest}
        style={[typeScale.body, styles.input, { backgroundColor: p.card, color: p.ink, borderColor: focused ? p.brand : p.border, borderWidth: focused ? 1.5 : 1 }, style]}
      />
    </View>
  );
}

// Web preview only: the system time picker does not exist there, so ± buttons remain.
// clamp: stay within one day (00:00–23:45) instead of wrapping past midnight
function TimeButtons({ value, onChange, step = 15, clamp }: { value: string; onChange: (v: string) => void; step?: number; clamp?: boolean }) {
  const p = usePalette();
  const t = useT();
  const m = toMin(value);
  const btn = (d: number, name: IconName) => (
    <PressableScale
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
      scaleTo={0.9}
      style={[styles.step, { backgroundColor: p.fill }]}
    >
      <Icon name={name} size={18} color={p.ink2} />
    </PressableScale>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {btn(-step, 'remove')}
      <Txt v="headline" style={{ minWidth: 52, textAlign: 'center', fontVariant: ['tabular-nums'] }}>
        {value}
      </Txt>
      {btn(step, 'add')}
    </View>
  );
}

// Time of day as a tappable value: the system picker pops up (Android dialog, iOS wheel in a sheet).
// `step` and `clamp` only matter for the web preview's ± buttons.
export function TimeStepper(props: { value: string; onChange: (v: string) => void; step?: number; clamp?: boolean }) {
  const { value, onChange } = props;
  const p = usePalette();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  if (Platform.OS === 'web') return <TimeButtons {...props} />;
  const asDate = (hm: string) => {
    const d = new Date();
    d.setHours(Math.floor(toMin(hm) / 60), toMin(hm) % 60, 0, 0);
    return d;
  };
  const hm = (d: Date) => fromMin(d.getHours() * 60 + d.getMinutes());
  const commit = (v: string) => {
    if (v === value) return;
    haptic.tap();
    onChange(v);
  };
  const press = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: asDate(value), mode: 'time', is24Hour: true, onChange: (e, d) => e.type === 'set' && d && commit(hm(d)) });
    } else {
      setDraft(value);
      setOpen(true);
    }
  };
  return (
    <>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${t('ui.pickTime')}: ${value}`}
        onPress={press}
        hitSlop={6}
        scaleTo={0.95}
        style={[styles.timeChip, { backgroundColor: p.fill }]}
      >
        <Icon name="time-outline" size={16} color={p.ink2} />
        <Txt v="headline" style={{ fontVariant: ['tabular-nums'] }}>
          {value}
        </Txt>
      </PressableScale>
      {Platform.OS === 'ios' ? (
        <Sheet visible={open} title={t('ui.pickTime')} onClose={() => setOpen(false)}>
          <DateTimePicker value={asDate(draft)} mode="time" display="spinner" is24Hour minuteInterval={5} locale={getLang()} onChange={(_, d) => d && setDraft(hm(d))} />
          <Btn
            title={t('ui.timeDone')}
            onPress={() => {
              setOpen(false);
              commit(draft);
            }}
          />
        </Sheet>
      ) : null}
    </>
  );
}

// A calendar date ('YYYY-MM-DD') as a tappable value, the TimeStepper pattern in date mode: Android opens the system
// date dialog; iOS shows the compact system picker in place (its own popover, so it works inside a Sheet without a
// second Modal); the web preview steps ±1 day. `min` / `max` bound the choice.
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dateOf = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12); // midday: no time zone or DST shift can move it to another day
};
export function DateField({ value, onChange, min, max, label }: { value: string; onChange: (v: string) => void; min?: string; max?: string; label: string }) {
  const p = usePalette();
  const t = useT();
  const commit = (v: string) => {
    const next = min && v < min ? min : max && v > max ? max : v;
    if (next === value) return;
    haptic.tap();
    onChange(next);
  };
  const a11y = `${label}: ${shortDate(value)}`;
  if (Platform.OS === 'web') {
    const step = (d: -1 | 1) => {
      const x = dateOf(value);
      x.setDate(x.getDate() + d);
      const v = isoOf(x);
      if ((min && v < min) || (max && v > max)) return haptic.warn();
      commit(v);
    };
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} accessibilityLabel={a11y}>
        <PressableScale accessibilityRole="button" accessibilityLabel={t('ui.earlier')} onPress={() => step(-1)} hitSlop={6} scaleTo={0.9} style={[styles.step, { backgroundColor: p.fill }]}>
          <Icon name="chevron-back" size={18} color={p.ink2} />
        </PressableScale>
        <Txt v="headline" style={{ minWidth: 92, textAlign: 'center' }}>
          {shortDate(value)}
        </Txt>
        <PressableScale accessibilityRole="button" accessibilityLabel={t('ui.later')} onPress={() => step(1)} hitSlop={6} scaleTo={0.9} style={[styles.step, { backgroundColor: p.fill }]}>
          <Icon name="chevron-forward" size={18} color={p.ink2} />
        </PressableScale>
      </View>
    );
  }
  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker
        testID={`date-${label}`}
        accessibilityLabel={a11y}
        value={dateOf(value)}
        mode="date"
        display="compact"
        locale={getLang()}
        minimumDate={min ? dateOf(min) : undefined}
        maximumDate={max ? dateOf(max) : undefined}
        accentColor={p.brand}
        onChange={(_, d) => d && commit(isoOf(d))}
      />
    );
  }
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={() =>
        DateTimePickerAndroid.open({
          value: dateOf(value),
          mode: 'date',
          minimumDate: min ? dateOf(min) : undefined,
          maximumDate: max ? dateOf(max) : undefined,
          onChange: (e, d) => e.type === 'set' && d && commit(isoOf(d)),
        })
      }
      hitSlop={6}
      scaleTo={0.95}
      style={[styles.timeChip, { backgroundColor: p.fill }]}
    >
      <Icon name="calendar-outline" size={16} color={p.ink2} />
      <Txt v="headline">{shortDate(value)}</Txt>
    </PressableScale>
  );
}

export function EmojiPicker({ value, onChange, options }: { value: string; onChange: (e: string) => void; options: string[] }) {
  const p = usePalette();
  return (
    <View style={styles.wrap}>
      {options.map((e) => (
        <PressableScale
          key={e}
          accessibilityRole="button"
          accessibilityLabel={e}
          accessibilityState={{ selected: e === value }}
          scaleTo={0.9}
          onPress={() => {
            haptic.tap();
            onChange(e);
          }}
          style={[styles.emoji, { backgroundColor: e === value ? p.brandSoft : p.fill, borderColor: e === value ? p.brand : 'transparent' }]}
        >
          <Text style={{ fontSize: 22 }}>{e}</Text>
        </PressableScale>
      ))}
    </View>
  );
}

// ---------- bottom sheet ----------
// Springs up from the bottom edge and leaves the same way; drag the grip/header down (or flick) to dismiss.
// With Reduce Motion it cross-fades instead. `overlay` is rendered last inside the Modal (e.g. a toast).
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 900;
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
  const { height } = useWindowDimensions();
  const reduce = useReducedMotion();
  // stays mounted while it animates out, so the content doesn't vanish mid-slide
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);
  const y = useSharedValue(height);
  const fade = useSharedValue(0);
  const sheetH = useSharedValue(height);

  useEffect(() => {
    if (!mounted) return;
    const unmount = (finished?: boolean) => {
      'worklet';
      if (finished) scheduleOnRN(setMounted, false);
    };
    if (visible) {
      fade.set(withTiming(1, { duration: 200 }));
      y.set(reduce ? 0 : withSpring(0, motion.sheetOpen));
    } else if (reduce) {
      fade.set(withTiming(0, motion.exit, unmount));
    } else {
      fade.set(withTiming(0, motion.exit));
      y.set(withTiming(sheetH.get(), motion.exit, unmount));
    }
  }, [visible, mounted, reduce, fade, y, sheetH]);

  const pan = Gesture.Pan()
    .enabled(!reduce)
    .activeOffsetY(10)
    .onUpdate((e) => {
      // 1:1 downwards; resist when pulled up past the top
      y.set(e.translationY >= 0 ? e.translationY : -Math.sqrt(-e.translationY) * 2);
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
        scheduleOnRN(onClose);
      } else {
        y.set(withSpring(0, { ...motion.snapBack, velocity: e.velocityY }));
      }
    });

  const scrimStyle = useAnimatedStyle(() => ({ opacity: reduce ? fade.get() : fade.get() * interpolate(y.get(), [0, sheetH.get()], [1, 0], 'clamp') }));
  const sheetStyle = useAnimatedStyle(() => (reduce ? { opacity: fade.get() } : { transform: [{ translateY: Math.max(-40, y.get()) }] }));

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: p.scrim }, scrimStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('common.close')} accessible={false} />
        </Animated.View>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'flex-end' }} pointerEvents="box-none">
          {/* never taller than the window below the status bar: on small phones, landscape or large text the
              content scrolls and the header with the close button stays on screen */}
          <Animated.View
            onLayout={(e) => sheetH.set(e.nativeEvent.layout.height + 40)}
            style={[
              styles.sheet,
              elevation(p, 3),
              { backgroundColor: p.bgElevated, paddingBottom: insets.bottom + space.m, width: '100%', maxWidth: 600, alignSelf: 'center', maxHeight: height - insets.top - 12, flexShrink: 1 },
              sheetStyle,
            ]}
          >
            <GestureDetector gesture={pan}>
              <View style={styles.sheetHead}>
                <View style={[styles.grip, { backgroundColor: p.line }]} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
                  <Txt v="title" accessibilityRole="header" style={{ flex: 1 }}>
                    {title}
                  </Txt>
                  <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')} style={[styles.close, { backgroundColor: p.fill }]}>
                    <Icon name="close" size={17} color={p.ink2} />
                  </Pressable>
                </View>
              </View>
            </GestureDetector>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
              {children}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
        {overlay}
      </GestureHandlerRootView>
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
    RNAnimated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }).start(({ finished }) => finished && setState(null));
  const show = (msg: string, action?: { label: string; run: () => void }) => {
    setState({ msg, action });
    // TalkBack reads the toast through its live region; VoiceOver needs an explicit announcement
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(msg);
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
  // slides up 8pt while fading in: enters and leaves along the same path
  const translateY = opacity.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });
  return (
    <RNAnimated.View
      pointerEvents="box-none"
      accessibilityLiveRegion="polite"
      style={[styles.toast, elevation(p, 2), { opacity, transform: [{ translateY }], bottom: Math.max(insets.bottom + 92, kb + 16), backgroundColor: p.ink }]}
    >
      <Txt v="callout" color={p.bg} style={{ flex: 1 }}>
        {msg}
      </Txt>
      {action ? (
        <Pressable
          onPress={() => {
            onAction(); // hide first: a toast shown by run() then replaces this one instead of fading out with it
            action.run();
          }}
          hitSlop={12}
          accessibilityRole="button"
        >
          <Txt v="label" color={p.onInkAccent}>
            {action.label}
          </Txt>
        </Pressable>
      ) : null}
    </RNAnimated.View>
  );
}

// Empty state: an icon on a soft tile (or the user's emoji), a plain title, one line of help and an optional action.
export function Empty({ icon, title, text, children }: { icon: string; title: string; text?: string; children?: ReactNode }) {
  const p = usePalette();
  return (
    <View style={styles.empty}>
      {isIconName(icon) ? (
        <View style={[styles.emptyIcon, { backgroundColor: p.brandSoft }]}>
          <View style={[styles.emptyDot, { backgroundColor: p.margin }]} />
          <Icon name={icon} size={30} color={p.brand} />
        </View>
      ) : (
        <Text style={{ fontSize: 44 }} maxFontSizeMultiplier={1.2} accessible={false} importantForAccessibility="no">
          {icon}
        </Text>
      )}
      <Txt v="headline" style={{ marginTop: space.s, textAlign: 'center' }}>
        {title}
      </Txt>
      {text ? (
        <Txt v="callout" color={p.muted} style={{ marginTop: 4, textAlign: 'center', maxWidth: 360 }}>
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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: p.bg, padding: space.l }}>
        <Empty icon="cloud-offline-outline" title={error}>
          {onRetry ? <Btn title={t('common.retry')} icon="refresh" onPress={onRetry} style={{ marginTop: space.m, alignSelf: 'stretch', minWidth: 200 }} /> : null}
        </Empty>
      </View>
    );
  }
  return <LoadingSkeleton label={t('common.loading')} />;
}

// A failed refresh while older data is still on screen: say so instead of silently showing stale data.
export function ErrorBanner({ error, onRetry }: { error: string | null; onRetry?: () => void }) {
  const p = usePalette();
  const t = useT();
  if (!error) return null;
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.errorBanner, { backgroundColor: p.badSoft }]}>
      <Icon name="cloud-offline-outline" size={20} color={p.bad} />
      <Txt v="sub" style={{ flex: 1 }}>
        {t('common.loadFail', { error })}
      </Txt>
      {onRetry ? <Btn small kind="plain" title={t('common.retry')} onPress={onRetry} /> : null}
    </View>
  );
}

// Mirrors a typical Screen: large title, a hero card and a grouped list of rows.
function LoadingSkeleton({ label }: { label: string }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const { pad } = useLayout();
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityState={{ busy: true }} style={{ flex: 1, backgroundColor: p.bg }}>
      <View style={{ paddingHorizontal: pad, paddingTop: insets.top + space.s, width: '100%', maxWidth: CONTENT_MAX + pad * 2, alignSelf: 'center' }}>
        <View style={[styles.header, { alignItems: 'center' }]}>
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width="30%" height={12} r={6} />
            <Skeleton width="58%" height={30} r={8} />
          </View>
          <Skeleton width={44} height={44} r={22} />
        </View>
        <View style={[styles.group, { backgroundColor: p.card, borderColor: p.line, padding: space.m, gap: space.s }]}>
          <View style={{ flexDirection: 'row', gap: space.m, alignItems: 'center' }}>
            <Skeleton width={72} height={72} r={36} />
            <View style={{ flex: 1, gap: 8 }}>
              <Skeleton width="70%" height={18} />
              <Skeleton width="45%" height={12} />
            </View>
          </View>
          <Skeleton height={8} r={4} />
        </View>
        <Skeleton width="24%" height={12} r={6} style={{ marginTop: space.l, marginBottom: space.xs, marginLeft: 4 }} />
        <View style={[styles.group, { backgroundColor: p.card, borderColor: p.line }]}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i}>
              {i > 0 ? <View style={[styles.hair, { backgroundColor: p.line, marginLeft: 60 }]} /> : null}
              <View style={styles.row}>
                <Skeleton width={32} height={32} r={10} />
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
  header: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: space.m, gap: space.s },
  sectionRow: { flexDirection: 'row', alignItems: 'center', minHeight: 28, marginTop: space.l, marginBottom: space.xs, paddingHorizontal: 4, gap: space.xs },
  group: { borderRadius: radius.l, overflow: 'hidden', borderWidth: hairline },
  hair: { height: hairline },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.s, paddingHorizontal: space.m, paddingVertical: 10, minHeight: 52 },
  banner: { borderRadius: radius.l, padding: space.m, marginTop: space.xs, gap: space.s },
  bannerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.s - 2 },
  btn: { borderRadius: radius.m, alignItems: 'center', justifyContent: 'center' },
  btnBig: { paddingVertical: 14, paddingHorizontal: 20, minHeight: 52 },
  btnSmall: { paddingVertical: 8, paddingHorizontal: 14, minHeight: 40, borderRadius: radius.s + 2 },
  btnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: hairline },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.s + 2, minHeight: 38, paddingVertical: 8, paddingHorizontal: 13, borderWidth: hairline },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  input: { borderRadius: radius.m, paddingHorizontal: 14, paddingVertical: 13 },
  step: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  timeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: 18 },
  emoji: { width: 46, height: 46, borderRadius: radius.m, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: 8 },
  sheetHead: { paddingHorizontal: 20, paddingBottom: space.s },
  grip: { width: 36, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: space.s },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  toast: { position: 'absolute', left: space.m, right: space.m, borderRadius: radius.m, paddingHorizontal: space.m, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: space.s },
  empty: { alignItems: 'center', paddingVertical: space.xl, paddingHorizontal: space.l },
  emptyIcon: { width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  emptyDot: { position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: 4 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.l, paddingVertical: 8, paddingHorizontal: space.s, marginBottom: space.s },
});

