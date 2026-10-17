import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { api, type Override, type Setup } from '@/lib/api';
import { isoWeekday, shortDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { radius, space, usePalette } from '@/lib/theme';

import { Btn, Chip, Empty, Field, Group, Icon, Row, Sheet, ToggleRow, Txt } from './ui';

export const OVERRIDE_DAYS = 30;
export const OVERRIDE_NOTE_MAX = 120;
const MAX_LESSONS = 14;

/** today .. today + 30 as 'YYYY-MM-DD' (calendar arithmetic in UTC: no DST surprises). */
export function overrideDates(today: string, n = OVERRIDE_DAYS) {
  const out: string[] = [];
  const d = new Date(today + 'T00:00:00Z');
  for (let i = 0; i <= n; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

// ISO week parity (1 odd, 2 even) of a date, as the server's alternating timetable uses.
function parityOf(iso: string): '1' | '2' {
  const x = new Date(iso + 'T00:00:00Z');
  const wd = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - wd);
  const week = Math.ceil(((x.getTime() - Date.UTC(x.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
  return week % 2 ? '1' : '2';
}

/** The lessons the timetable gives a date (alternating week first when it has lessons that day). */
export function timetableFor(setup: Setup, iso: string) {
  const wd = String(isoWeekday(iso));
  const alt = setup.lessons_alt?.[parityOf(iso)]?.[wd];
  return alt?.length ? alt : (setup.lessons[wd] ?? []);
}

/**
 * "Change only this day": pick a date (today … +30), that day's lessons in order (or "no lessons") and a note.
 * Checklist items are not affected. Saving again for the same date replaces the override.
 */
export function OverrideSheet({
  visible,
  setup,
  today,
  date: initialDate,
  onClose,
  onSaved,
}: {
  visible: boolean;
  setup: Setup;
  today: string;
  /** open on this date (editing an existing override) */
  date?: string | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const p = usePalette();
  const t = useT();
  const dates = overrideDates(today);
  const byId = new Map(setup.subjects.map((s) => [s.id, s]));
  const existing = (d: string): Override | undefined => setup.overrides?.find((o) => o.date === d);
  const stateFor = (d: string) => {
    const o = existing(d);
    const ids = (o ? o.subject_ids : timetableFor(setup, d)).filter((id) => byId.has(id));
    return { date: d, ids, none: !!o && o.subject_ids.length === 0, note: o?.note ?? '' };
  };
  // by default the next day that has lessons in the timetable (the usual reason: a short day, a swapped lesson)
  const first = initialDate && dates.includes(initialDate) ? initialDate : (dates.slice(1).find((d) => timetableFor(setup, d).length) ?? dates[1] ?? dates[0]);
  const [st, setSt] = useState(() => stateFor(first));
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // a fresh start each time the sheet opens
  if (visible && !opened) {
    setOpened(true);
    setSt(stateFor(first));
    setError(null);
  }
  if (!visible && opened) setOpened(false);

  const pick = (d: string) => setSt(stateFor(d));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= st.ids.length) return;
    const next = [...st.ids];
    [next[i], next[j]] = [next[j], next[i]];
    setSt({ ...st, ids: next });
  };
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.setOverride(st.date, { child_id: setup.child_id, subject_ids: st.none ? [] : st.ids, note: st.note.trim() || null });
      onSaved(t('parent.ovr.saved', { date: shortDate(st.date) }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} title={t('parent.ovr.title')} onClose={onClose}>
      <Txt v="callout" color={p.muted}>
        {t('parent.ovr.hint')}
      </Txt>
      <Txt v="sub" color={p.ink2} style={styles.label}>
        {t('parent.ovr.date')}
      </Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dates} keyboardShouldPersistTaps="handled">
        {dates.map((d) => (
          <Chip key={d} label={d === today ? `${t('parent.cal.today')}, ${shortDate(d)}` : shortDate(d)} icon={existing(d) ? 'swap-horizontal' : undefined} selected={d === st.date} onPress={() => pick(d)} />
        ))}
      </ScrollView>

      <Group style={{ marginTop: space.s }}>
        <ToggleRow icon="bed" tint="gray" title={t('parent.ovr.none')} subtitle={t('parent.ovr.noneSub')} value={st.none} onChange={(none) => setSt({ ...st, none })} />
      </Group>

      {!st.none ? (
        <>
          <Txt v="sub" color={p.ink2} style={styles.label}>
            {t('parent.ovr.lessons', { n: st.ids.length })}
          </Txt>
          {st.ids.length ? (
            <Group>
              {st.ids.map((id, i) => {
                const s = byId.get(id);
                const name = s?.name ?? t('parent.schedule.subject');
                return (
                  <Row
                    key={`${id}-${i}`}
                    icon={s?.emoji ?? '📘'}
                    title={`${i + 1}. ${name}`}
                    right={
                      <View style={{ flexDirection: 'row', gap: 4 }}>
                        <Mini icon="chevron-up" label={t('parent.schedule.upA11y', { name })} disabled={i === 0} onPress={() => move(i, -1)} />
                        <Mini icon="chevron-down" label={t('parent.schedule.downA11y', { name })} disabled={i === st.ids.length - 1} onPress={() => move(i, 1)} />
                        <Mini icon="close" bad label={t('parent.schedule.removeA11y', { name })} onPress={() => setSt({ ...st, ids: st.ids.filter((_, k) => k !== i) })} />
                      </View>
                    }
                  />
                );
              })}
            </Group>
          ) : (
            <Group>
              <Empty icon="book-outline" title={t('parent.ovr.empty')} text={t('parent.ovr.emptyText')} />
            </Group>
          )}
          {setup.subjects.length && st.ids.length < MAX_LESSONS ? (
            <>
              <Txt v="sub" color={p.muted} style={styles.label}>
                {t('parent.ovr.add')}
              </Txt>
              <View style={styles.wrap}>
                {setup.subjects.map((s) => (
                  <Chip key={s.id} label={`${s.emoji} ${s.name}`} icon="add" tone="muted" onPress={() => setSt({ ...st, ids: [...st.ids, s.id] })} />
                ))}
              </View>
            </>
          ) : null}
        </>
      ) : null}

      <View style={{ marginTop: space.m }}>
        <Field label={t('parent.ovr.note')} value={st.note} onChangeText={(note) => setSt({ ...st, note })} placeholder={t('parent.ovr.notePh')} maxLength={OVERRIDE_NOTE_MAX} />
      </View>
      {error ? (
        <Txt v="callout" color={p.bad} style={{ marginBottom: space.s }} accessibilityLiveRegion="polite">
          {error}
        </Txt>
      ) : null}
      <Btn title={t('parent.ovr.save')} icon="checkmark" loading={busy} disabled={!st.none && !st.ids.length && !existing(st.date)} onPress={save} />
    </Sheet>
  );
}

function Mini({ icon, label, onPress, disabled, bad }: { icon: 'chevron-up' | 'chevron-down' | 'close'; label: string; onPress: () => void; disabled?: boolean; bad?: boolean }) {
  const p = usePalette();
  return (
    <Pressable
      hitSlop={6}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={[styles.mini, { backgroundColor: bad ? p.badSoft : p.fill, opacity: disabled ? 0.35 : 1 }]}
    >
      <Icon name={icon} size={17} color={bad ? p.bad : p.ink2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: { marginTop: space.m, marginBottom: space.xs, marginLeft: 4, fontWeight: '600' },
  dates: { gap: space.xs, paddingHorizontal: 2, paddingVertical: 2 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  mini: { width: 32, height: 32, borderRadius: radius.s, alignItems: 'center', justifyContent: 'center' },
});
