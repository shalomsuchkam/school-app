import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Empty, Group, IconBtn, Loading, Row, Screen, SectionLabel, Txt, useLayout } from '@/components/ui';
import { api, type Report } from '@/lib/api';
import { duration, isoWeekday, shortDate, wdShort } from '@/lib/format';
import { tn, useT } from '@/lib/i18n';
import { radius, usePalette } from '@/lib/theme';

type Kind = 'on_time' | 'late' | 'skipped' | 'missed';
const KINDS: Kind[] = ['on_time', 'late', 'skipped', 'missed'];
const LABEL: Record<Kind, string> = { on_time: 'parent.report.onTime', late: 'parent.report.late', skipped: 'parent.report.skipped', missed: 'parent.report.missed' };
const BAR_H = 120;

export default function WeeklyReport() {
  const p = usePalette();
  const t = useT();
  const { wide } = useLayout();
  const [report, setReport] = useState<Report | null>(null);
  const [trackTime, setTrackTime] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, me] = await Promise.all([api.report(), api.me()]);
      setReport(r);
      setTrackTime(me.family.track_time);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  if (!report) return <Loading error={error} onRetry={load} />;

  const color: Record<Kind, string> = { on_time: p.ok, late: p.warn, skipped: p.muted, missed: p.bad };
  const back = () => (router.canGoBack() ? router.back() : router.replace('/parent'));
  const { totals } = report;
  const maxTotal = Math.max(1, ...report.days.map((d) => d.total));
  const mins = report.days.filter((d) => d.minutes !== null);
  const maxMin = Math.max(1, ...mins.map((d) => d.minutes ?? 0));
  const avgMin = mins.length ? Math.round(mins.reduce((s, d) => s + (d.minutes ?? 0), 0) / mins.length) : 0;
  // most problems first: not done weighs most, then late, then skipped
  const score = (s: Report['subjects'][number]) => s.missed * 100 + s.late * 10 + s.skipped;
  const subjects = [...report.subjects].sort((a, b) => score(b) - score(a) || b.total - a.total || a.title.localeCompare(b.title));

  const tiles = (
    <View style={styles.tiles}>
      {KINDS.map((k) => (
        <View key={k} style={[styles.tile, { backgroundColor: p.card, shadowColor: p.shadow, flexBasis: wide ? '22%' : '45%' }]}>
          <Txt v="largeTitle" color={color[k]} style={{ fontVariant: ['tabular-nums'] }}>
            {totals[k]}
          </Txt>
          <Txt v="sub" color={p.muted}>
            {t(LABEL[k])}
          </Txt>
        </View>
      ))}
    </View>
  );

  const byDay = (
    <>
      <SectionLabel>{t('parent.report.byDay')}</SectionLabel>
      <View style={[styles.chart, { backgroundColor: p.card, shadowColor: p.shadow }]}>
        <View style={styles.bars}>
          {report.days.map((d) => (
            <View key={d.date} style={styles.col} accessible accessibilityLabel={`${shortDate(d.date)}: ${KINDS.map((k) => `${t(LABEL[k])} ${d[k]}`).join(', ')}`}>
              <Txt v="sub" color={p.muted} style={{ fontVariant: ['tabular-nums'] }}>
                {d.total || '–'}
              </Txt>
              <View style={[styles.barBox, { backgroundColor: p.fill }]}>
                {/* stacked from the bottom: on time, late, skipped, not done */}
                <View style={{ height: (d.total / maxTotal) * BAR_H, justifyContent: 'flex-end', overflow: 'hidden', borderRadius: 6 }}>
                  {[...KINDS].reverse().map((k) => (d[k] ? <View key={k} style={{ flex: d[k], backgroundColor: color[k] }} /> : null))}
                </View>
              </View>
              <Txt v="sub" color={p.ink}>
                {wdShort(isoWeekday(d.date))}
              </Txt>
            </View>
          ))}
        </View>
        <View style={styles.legend}>
          {KINDS.map((k) => (
            <View key={k} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: color[k] }]} />
              <Txt v="sub" color={p.muted}>
                {t(LABEL[k])}
              </Txt>
            </View>
          ))}
        </View>
      </View>
    </>
  );

  const minutes = trackTime ? (
    <>
      <SectionLabel>{t('parent.report.minutes')}</SectionLabel>
      <View style={[styles.chart, { backgroundColor: p.card, shadowColor: p.shadow }]}>
        {mins.length ? (
          <>
            <Txt v="callout" color={p.muted} style={{ marginBottom: 10 }}>
              {t('parent.report.avg', { d: duration(avgMin) })}
            </Txt>
            {report.days.map((d) => (
              <View key={d.date} style={styles.minRow}>
                <Txt v="sub" style={{ width: 36 }}>
                  {wdShort(isoWeekday(d.date))}
                </Txt>
                <View style={[styles.minTrack, { backgroundColor: p.fill }]}>
                  {d.minutes !== null ? <View style={{ width: `${Math.max(2, (d.minutes / maxMin) * 100)}%`, height: '100%', borderRadius: 5, backgroundColor: p.brand }} /> : null}
                </View>
                <Txt v="sub" color={p.muted} style={{ width: 64, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
                  {d.minutes !== null ? duration(d.minutes) : '–'}
                </Txt>
              </View>
            ))}
          </>
        ) : (
          <Txt v="callout" color={p.muted}>
            {t('parent.report.noMinutes')}
          </Txt>
        )}
      </View>
    </>
  ) : null;

  const bySubject = subjects.length ? (
    <>
      <SectionLabel>{t('parent.report.bySubject')}</SectionLabel>
      <Group>
        {subjects.map((s) => {
          const parts = [
            s.missed ? t('parent.report.sMissed', { n: s.missed }) : '',
            s.late ? t('parent.report.sLate', { n: s.late }) : '',
            s.skipped ? t('parent.report.sSkipped', { n: s.skipped }) : '',
            s.onTime ? t('parent.report.sOnTime', { n: s.onTime }) : '',
          ].filter(Boolean);
          const ok = !s.missed && !s.late && !s.skipped;
          return (
            <Row
              key={`${s.emoji}${s.title}`}
              icon={s.emoji || '📘'}
              title={s.title}
              subtitle={ok ? `${t('parent.report.allGood')} · ${parts.join(' · ')}` : parts.join(' · ')}
              right={
                <View style={[styles.mini, { backgroundColor: p.fill }]}>
                  {s.onTime ? <View style={{ flex: s.onTime, backgroundColor: p.ok }} /> : null}
                  {s.late ? <View style={{ flex: s.late, backgroundColor: p.warn }} /> : null}
                  {s.skipped ? <View style={{ flex: s.skipped, backgroundColor: p.muted }} /> : null}
                  {s.missed ? <View style={{ flex: s.missed, backgroundColor: p.bad }} /> : null}
                </View>
              }
            />
          );
        })}
      </Group>
    </>
  ) : null;

  return (
    <Screen
      title={t('parent.report.title')}
      subtitle={t('parent.report.range', { from: shortDate(report.from), to: shortDate(report.to) })}
      onRefresh={load}
      right={<IconBtn icon="close" label={t('common.close')} onPress={back} />}
    >
      {!totals.total ? (
        <Empty icon="📊" title={t('parent.report.emptyTitle')} text={t('parent.report.emptyText')} />
      ) : (
        <>
          <View style={[styles.streak, { backgroundColor: p.brandSoft }]}>
            <Txt v="headline" color={p.brand}>
              {tn('parent.report.streak', report.streak)}
            </Txt>
            <Txt v="callout" color={p.ink}>
              {t('parent.report.perfect', { n: report.perfect_week })}
            </Txt>
            <Txt v="sub" color={p.muted} style={{ width: '100%' }}>
              {tn('parent.report.tasks', totals.total)}
            </Txt>
          </View>
          {tiles}
          {wide ? (
            <View style={styles.cols}>
              <View style={{ flex: 1 }}>
                {byDay}
                {minutes}
              </View>
              <View style={{ flex: 1 }}>{bySubject}</View>
            </View>
          ) : (
            <>
              {byDay}
              {minutes}
              {bySubject}
            </>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  streak: { borderRadius: radius.l, padding: 14, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 14, rowGap: 4 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  tile: { flexGrow: 1, borderRadius: radius.l, padding: 14, shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  chart: { borderRadius: radius.l, padding: 14, shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  bars: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  col: { flex: 1, alignItems: 'center', gap: 6 },
  barBox: { width: '100%', maxWidth: 36, height: BAR_H, borderRadius: 6, justifyContent: 'flex-end', overflow: 'hidden' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  minRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  minTrack: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden' },
  mini: { width: 56, height: 8, borderRadius: 4, overflow: 'hidden', flexDirection: 'row' },
  cols: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
});
