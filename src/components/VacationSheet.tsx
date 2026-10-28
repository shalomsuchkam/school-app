import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { api } from '@/lib/api';
import { useT, tn } from '@/lib/i18n';
import { space, usePalette } from '@/lib/theme';
import { addDaysIso, daysBetween, NOTE_MAX, rangeBounds, rangeProblem, withFrom } from '@/lib/vacation';

import { Btn, Chip, DateField, Field, Group, Row, Sheet, Txt } from './ui';

const PRESETS = ['autumn', 'winter', 'spring', 'summer'] as const;

/**
 * "Add a school break": a date range («с» / «по», both included) and an optional name with quick chips.
 * Saved with one call (POST /parent/days-off): every date of the range becomes a day off for the whole family.
 * The dates themselves are never suggested: the Ministry sets them anew every year.
 */
export function VacationSheet({ visible, today, onClose, onSaved }: { visible: boolean; today: string; onClose: () => void; onSaved: (msg: string) => void }) {
  const p = usePalette();
  const t = useT();
  const fresh = () => ({ from: addDaysIso(today, 1), to: addDaysIso(today, 7), note: '' });
  const [st, setSt] = useState(fresh);
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // a clean form each time the sheet opens
  if (visible && !opened) {
    setOpened(true);
    setSt(fresh());
    setError(null);
  }
  if (!visible && opened) setOpened(false);

  const b = rangeBounds(today, st.from);
  const problem = rangeProblem(st.from, st.to, today);
  const n = daysBetween(st.from, st.to) + 1;
  const save = async () => {
    if (problem) return setError(t(problem));
    setBusy(true);
    setError(null);
    try {
      await api.daysOffRange(st.from, st.to, true, st.note.trim() || null);
      onSaved(t('parent.vac.saved'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} title={t('parent.vac.sheetTitle')} onClose={onClose}>
      <Txt v="callout" color={p.muted}>
        {t('parent.vac.hint')}
      </Txt>
      <Group style={{ marginTop: space.m }}>
        <Row
          icon="calendar-outline"
          title={t('parent.vac.from')}
          right={<DateField label={t('parent.vac.from')} value={st.from} min={b.min} max={b.max} onChange={(from) => setSt({ ...st, ...withFrom(st, from, today) })} />}
        />
        <Row
          icon="calendar"
          title={t('parent.vac.to')}
          right={<DateField label={t('parent.vac.to')} value={st.to} min={b.toMin} max={b.toMax} onChange={(to) => setSt({ ...st, to })} />}
        />
      </Group>
      {!problem ? (
        <Txt v="sub" color={p.ink2} style={styles.summary} accessibilityLiveRegion="polite">
          {tn('parent.vac.summary', n)}
        </Txt>
      ) : null}

      <View style={{ marginTop: space.m }}>
        <Field label={t('parent.vac.name')} value={st.note} onChangeText={(note) => setSt({ ...st, note })} placeholder={t('parent.vac.namePh')} maxLength={NOTE_MAX} />
      </View>
      <View style={styles.wrap}>
        {PRESETS.map((k) => {
          const name = t(`parent.vac.pn.${k}`);
          return <Chip key={k} label={t(`parent.vac.p.${k}`)} icon={k === 'summer' ? 'sunny-outline' : k === 'winter' ? 'snow-outline' : 'leaf-outline'} selected={st.note.trim() === name} onPress={() => setSt({ ...st, note: st.note.trim() === name ? '' : name })} />;
        })}
      </View>

      {error || problem ? (
        <Txt v="callout" color={p.bad} style={{ marginTop: space.s }} accessibilityLiveRegion="polite">
          {error ?? t(problem!)}
        </Txt>
      ) : null}
      <Btn title={t('parent.vac.save')} icon="checkmark" loading={busy} disabled={!!problem} onPress={save} style={{ marginTop: space.m }} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  summary: { marginTop: space.xs, marginLeft: 6 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
});
