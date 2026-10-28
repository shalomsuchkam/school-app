import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { dayLabel, MonthCalendar, offGlyph, statusStyle } from '@/components/MonthCalendar';
import { Paywall } from '@/components/Paywall';
import { Badge, Card, ErrorBanner, Group, Icon, IconBtn, Loading, Row, Screen, SectionLabel, Stat, Txt } from '@/components/ui';
import { api, isDone, isPaywall, type Calendar, type Child, type Overview, type Task } from '@/lib/api';
import { addMonths, countStatuses, monthOf } from '@/lib/calendar';
import { ChildSwitcher, currentChildReady, getCurrentChild, setCurrentChild, useCurrentChild } from '@/lib/currentChild';
import { longDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { space, usePalette } from '@/lib/theme';

function todayIn(tz: string) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

// Month at a glance for one child (parents and viewers): each school day coloured by how it went.
export default function MonthScreen() {
  const p = usePalette();
  const t = useT();
  const [kids, setKids] = useState<Child[]>([]);
  const [childId] = useCurrentChild(kids);
  const [month, setMonth] = useState<string | null>(null);
  const [cal, setCal] = useState<Calendar | null>(null);
  const [ov, setOv] = useState<Overview | null>(null);
  const [today, setToday] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async (m?: string | null) => {
    const my = ++seq.current;
    setBusy(true);
    try {
      const cid = await currentChildReady();
      const [c, o, me] = await Promise.all([api.calendar(m ?? undefined, cid ?? undefined), api.overview(cid ?? undefined), api.me()]);
      if (my !== seq.current || getCurrentChild() !== cid) return;
      setCal(c);
      setOv(o);
      setKids(me.children);
      const td = todayIn(me.family.tz);
      setToday(td);
      setMonth(c.month);
      setSelected((s) => (s && monthOf(s) === c.month ? s : monthOf(td) === c.month ? td : null));
      setError(null);
      setPaywall(false);
    } catch (e) {
      if (isPaywall(e)) return setPaywall(true);
      if (my === seq.current) setError((e as Error).message);
    } finally {
      if (my === seq.current) setBusy(false);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      load(month);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]),
  );

  if (paywall) return <Paywall role="parent" onActive={() => load(month)} />;
  if (!cal || !month) return <Loading error={error} onRetry={() => load(month)} />;

  const go = (d: -1 | 1) => {
    const next = addMonths(month, d);
    setMonth(next);
    load(next);
  };
  const switchChild = (id: number | null) => {
    if (id === null || id === cal.child_id) return;
    setCurrentChild(id);
    setCal(null);
    setOv(null);
    load(month);
  };
  const back = () => (router.canGoBack() ? router.back() : router.replace('/parent'));
  const counts = countStatuses(cal.days);
  const day = selected ? cal.days.find((d) => d.date === selected) : undefined;
  // details (tasks) exist for the days the overview covers: the active day and the recent history
  const detail = selected ? ov?.days.find((d) => d.date === selected) : undefined;

  return (
    <Screen title={t('parent.cal.title')} subtitle={kids.find((k) => k.id === cal.child_id)?.name ?? ov?.child_name} onRefresh={() => load(month)} right={<IconBtn icon="close" label={t('common.close')} onPress={back} />}>
      <ChildSwitcher list={kids} value={childId} onChange={switchChild} />
      <ErrorBanner error={error} onRetry={() => load(month)} />
      <MonthCalendar month={month} days={cal.days} today={today} selected={selected} onSelect={setSelected} onMonth={go} loading={busy} />

      <View style={styles.stats}>
        <Stat value={counts.done_on_time} label={t('parent.cal.st.done_on_time')} icon="checkmark-circle" iconColor={p.ok} />
        <Stat value={counts.done_late} label={t('parent.cal.st.done_late')} icon="time" iconColor={p.warn} />
        <Stat value={counts.partial + counts.missed} label={t('parent.cal.notDone')} icon="alert-circle" iconColor={p.bad} />
      </View>

      {selected ? (
        <>
          <SectionLabel>{longDate(selected)}</SectionLabel>
          <Card style={{ gap: space.s }}>
            <View style={styles.dayHead}>
              <View style={[styles.swatch, { backgroundColor: statusStyle(p, day?.status).bg, borderColor: statusStyle(p, day?.status).border }]} />
              {offGlyph(day) ? <Icon name={offGlyph(day)!} size={16} color={p.muted} /> : null}
              <Txt v="headline" style={{ flex: 1 }}>
                {dayLabel(t, day)}
              </Txt>
              {day && day.total ? <Badge label={t('parent.cal.counts', { done: day.done, total: day.total })} tone={day.done === day.total ? 'ok' : day.done ? 'warn' : 'bad'} /> : null}
            </View>
            {detail?.override_note ? <Badge icon="swap-horizontal" tone="brand" label={detail.override_note} /> : null}
            {!detail ? (
              <Txt v="sub" color={p.muted}>
                {day?.status === 'future' ? t('parent.cal.futureHint') : day?.status === 'off' ? t('parent.cal.offHint') : t('parent.cal.noDetails')}
              </Txt>
            ) : null}
          </Card>
          {detail && detail.tasks.length ? (
            <Group style={{ marginTop: space.xs }}>
              {detail.tasks.map((x) => (
                <Row key={x.id} icon={x.emoji} title={x.label} subtitle={taskLine(x, t)} right={<TaskMark x={x} />} />
              ))}
            </Group>
          ) : null}
        </>
      ) : (
        <Txt v="sub" color={p.muted} style={{ marginTop: space.m, marginHorizontal: 6 }}>
          {t('parent.cal.tapHint')}
        </Txt>
      )}
    </Screen>
  );
}

function taskLine(x: Task, t: (k: string, v?: Record<string, string | number>) => string) {
  if (x.status === 'skip_ok') return t('child.st.skipOk');
  if (x.status === 'skip_pending') return t('child.st.waiting');
  if (x.status === 'redo') return t('child.st.redo');
  if (isDone(x)) return x.done_hm ? `${t('child.st.checked')} · ${x.done_hm}` : t('child.st.checked');
  return x.required ? t('parent.cal.st.missed') : t('child.st.optional');
}

function TaskMark({ x }: { x: Task }) {
  const p = usePalette();
  if (isDone(x)) return <Icon name="checkmark-circle" size={22} color={p.ok} />;
  if (x.status === 'skip_pending') return <Icon name="hourglass-outline" size={20} color={p.warn} />;
  return <Icon name={x.required ? 'close-circle-outline' : 'remove-circle-outline'} size={22} color={x.required ? p.bad : p.muted} />;
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: space.xs, marginTop: space.m },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  swatch: { width: 16, height: 16, borderRadius: 5, borderWidth: 1.5 },
});
