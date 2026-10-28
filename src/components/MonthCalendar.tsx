import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';

import type { CalendarDay, CalendarStatus } from '@/lib/api';
import { byDate, monthGrid, monthTitle, STATUSES, weekdayNames } from '@/lib/calendar';
import { longDate, wdShort } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { hairline, radius, space, usePalette, type Palette } from '@/lib/theme';

import { haptic, Icon, IconBtn, Txt } from './ui';

// How each day status reads at a glance. Colour is never the only cue: the legend names each,
// every cell announces its status, and finished days carry a tick / clock glyph colour family.
export function statusStyle(p: Palette, s: CalendarStatus | undefined) {
  switch (s) {
    case 'done_on_time':
      return { bg: p.okFill, fg: '#FFFFFF', border: p.okFill };
    case 'done_late':
      return { bg: p.warnSoft, fg: p.warn, border: p.warnSoft };
    case 'partial':
      return { bg: p.card, fg: p.warn, border: p.warn };
    case 'missed':
      return { bg: p.badSoft, fg: p.bad, border: p.badSoft };
    case 'future':
      return { bg: p.card, fg: p.ink, border: p.line };
    case 'off':
      return { bg: 'transparent', fg: p.muted, border: 'transparent' };
    default:
      return { bg: p.fill, fg: p.ink2, border: p.fill };
  }
}

export const statusLabel = (s: CalendarStatus) => `parent.cal.st.${s}`;

// What a cell announces and the detail card shows: a day off the parent set reads as the break ("Зимние каникулы"),
// a public holiday as a holiday; a plain weekend and every school day keep their status name.
export function dayLabel(t: (k: string) => string, d: Pick<CalendarDay, 'status' | 'off' | 'note'> | undefined) {
  if (!d) return t('parent.cal.st.empty');
  if (d.status === 'off' && d.off === 'day_off') return d.note ? `${t('parent.cal.offDay')}: ${d.note}` : t('parent.cal.offDay');
  if (d.status === 'off' && d.off === 'holiday') return t('parent.cal.holiday');
  return t(statusLabel(d.status));
}
// Off days the family did not just "not study" on get a small glyph: a bed for days off and breaks, a flag for holidays.
export const offGlyph = (d: Pick<CalendarDay, 'status' | 'off'> | undefined) =>
  d?.status !== 'off' ? null : d.off === 'day_off' ? ('bed-outline' as const) : d.off === 'holiday' ? ('flag-outline' as const) : null;

/**
 * Month grid, Monday first. Swipe left / right (or the arrows) to change the month; tap a day to select it.
 */
export function MonthCalendar({
  month,
  days,
  today,
  selected,
  onSelect,
  onMonth,
  loading,
}: {
  month: string;
  days: CalendarDay[] | undefined;
  today: string | null;
  selected: string | null;
  onSelect: (date: string) => void;
  /** -1 = previous month, +1 = next */
  onMonth: (delta: -1 | 1) => void;
  loading?: boolean;
}) {
  const p = usePalette();
  const t = useT();
  const map = byDate(days);
  const weeks = monthGrid(month);
  const names = weekdayNames() ?? [1, 2, 3, 4, 5, 6, 7].map(wdShort);
  const swipe = Gesture.Pan()
    .activeOffsetX([-24, 24])
    .failOffsetY([-16, 16])
    .onEnd((e) => {
      if (Math.abs(e.translationX) > 60 || Math.abs(e.velocityX) > 600) scheduleOnRN(onMonth, e.translationX < 0 ? 1 : -1);
    });
  return (
    <View>
      <View style={styles.head}>
        <IconBtn icon="chevron-back" label={t('parent.cal.prev')} onPress={() => onMonth(-1)} />
        <Txt v="title" accessibilityRole="header" accessibilityLiveRegion="polite" style={{ flex: 1, textAlign: 'center' }} numberOfLines={1} adjustsFontSizeToFit>
          {monthTitle(month)}
        </Txt>
        <IconBtn icon="chevron-forward" label={t('parent.cal.next')} onPress={() => onMonth(1)} />
      </View>
      <GestureDetector gesture={swipe}>
        <View style={[styles.grid, { backgroundColor: p.card, borderColor: p.line, opacity: loading ? 0.55 : 1 }]}>
          <View style={styles.week}>
            {names.map((n, i) => (
              <Txt key={i} v="caps" color={i >= 5 ? p.muted : p.ink2} style={styles.wd} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.2}>
                {n}
              </Txt>
            ))}
          </View>
          {weeks.map((w, i) => (
            <View key={i} style={styles.week}>
              {w.map((c, j) => {
                if (!c) return <View key={j} style={styles.cell} />;
                const d = map.get(c.date);
                const st = statusStyle(p, d?.status);
                const isSel = c.date === selected;
                const isToday = c.date === today;
                const label = t('parent.cal.dayA11y', {
                  date: longDate(c.date),
                  status: dayLabel(t, d),
                  done: d?.done ?? 0,
                  total: d?.total ?? 0,
                });
                return (
                  <Pressable
                    key={j}
                    testID={`cal-${c.date}`}
                    onPress={() => {
                      haptic.tap();
                      onSelect(c.date);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={isToday ? `${t('parent.cal.today')}, ${label}` : label}
                    accessibilityState={{ selected: isSel }}
                    style={styles.cell}
                  >
                    <View
                      style={[
                        styles.dayBox,
                        { backgroundColor: st.bg, borderColor: isSel ? p.brand : st.border, borderWidth: isSel ? 2 : d?.status === 'partial' ? 1.5 : hairline },
                      ]}
                    >
                      <Txt v="callout" color={st.fg} maxFontSizeMultiplier={1.3} style={{ fontWeight: isToday ? '800' : '600', fontVariant: ['tabular-nums'] }}>
                        {c.day}
                      </Txt>
                      {/* partial days show how far they got */}
                      {d?.status === 'partial' && d.total ? (
                        <View style={[styles.mini, { backgroundColor: p.warnSoft }]}>
                          <View style={{ width: `${Math.round((d.done / d.total) * 100)}%`, height: '100%', backgroundColor: p.warn }} />
                        </View>
                      ) : null}
                      {offGlyph(d) ? <Icon name={offGlyph(d)!} size={10} color={p.muted} style={styles.glyph} /> : null}
                      {isToday ? <View style={[styles.todayDot, { backgroundColor: d?.status === 'done_on_time' ? '#FFFFFF' : p.brand }]} /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </GestureDetector>
      <Legend />
    </View>
  );
}

export function Legend() {
  const p = usePalette();
  const t = useT();
  return (
    <View style={styles.legend} accessibilityLabel={t('parent.cal.legend')}>
      {STATUSES.map((s) => {
        const st = statusStyle(p, s);
        return (
          <View key={s} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: st.bg, borderColor: s === 'off' ? p.line : st.border, borderWidth: s === 'off' || s === 'future' ? 1 : 1.5 }]} />
            <Txt v="sub" color={p.ink2}>
              {t(statusLabel(s))}
            </Txt>
          </View>
        );
      })}
      {(['bed-outline', 'flag-outline'] as const).map((g) => (
        <View key={g} style={styles.legendItem}>
          <Icon name={g} size={13} color={p.muted} />
          <Txt v="sub" color={p.ink2}>
            {t(g === 'bed-outline' ? 'parent.cal.offDay' : 'parent.cal.holiday')}
          </Txt>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginBottom: space.s },
  grid: { borderRadius: radius.l, borderWidth: hairline, padding: space.xs, gap: 4 },
  week: { flexDirection: 'row', gap: 4 },
  wd: { flex: 1, textAlign: 'center', paddingVertical: 4 },
  cell: { flex: 1, aspectRatio: 1, maxHeight: 64 },
  dayBox: { flex: 1, borderRadius: radius.s, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  mini: { position: 'absolute', left: 6, right: 6, bottom: 5, height: 3, borderRadius: 2, overflow: 'hidden' },
  glyph: { position: 'absolute', bottom: 3 },
  todayDot: { position: 'absolute', top: 4, right: 4, width: 6, height: 6, borderRadius: 3 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.m, rowGap: space.xs, marginTop: space.s, paddingHorizontal: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 14, height: 14, borderRadius: 4 },
});
