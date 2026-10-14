import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';

import { PhotoViewer } from '@/components/PhotoViewer';
import { ParentTaskCard } from '@/components/TaskCards';
import { Btn, Chip, Empty, Group, Loading, Row, Screen, SectionLabel, Txt, useToast } from '@/components/ui';
import { api, ApiError, isDone, type Day, type Overview, type ParentAction, type Task } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { gradients, radius, usePalette } from '@/lib/theme';

export default function Today() {
  const p = usePalette();
  const { signOut } = useAuth();
  const [data, setData] = useState<Overview | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'day' | 'history'>('day');
  const [busy, setBusy] = useState<number | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ url: string; caption: string } | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const [ov, me] = await Promise.all([api.overview(), api.me()]);
      setData(ov);
      setName(me.family.child_name);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await signOut();
        router.replace('/welcome');
        return;
      }
      setError((e as Error).message);
    }
  }, [signOut]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => st === 'active' && load());
    const poll = setInterval(load, 30000);
    return () => {
      sub.remove();
      clearInterval(poll);
    };
  }, [load]);

  if (!data) return <Loading error={error} onRetry={load} />;

  const act = async (t: Task, a: ParentAction) => {
    setBusy(t.id);
    try {
      const r = await api.action(t.id, a);
      toast.show(r.text, a === 'reset' ? undefined : { label: 'Отменить', run: () => api.action(t.id, 'reset').then(load) });
      await load();
    } catch (e) {
      toast.show((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const nudge = async () => {
    try {
      const r = await api.nudge();
      toast.show(!r.left ? 'Всё уже сделано 🎉' : r.sent ? 'Напоминание отправлено 🔔' : 'Пуш-уведомления включатся после публикации в сторах');
    } catch (e) {
      toast.show((e as Error).message);
    }
  };
  const open = (url: string, caption: string) => setViewer({ url, caption });

  const active = data.days.find((d) => d.date === data.active)!;
  const history = data.days.filter((d) => d.date !== data.active);
  const left = active.total - active.done;
  const pending = active.tasks.filter((t) => t.status === 'skip_pending');
  const toReview = active.tasks.filter((t) => t.status === 'done' && t.needs_photo && !t.accepted);

  return (
    <>
      <Screen title={name || 'Сегодня'} subtitle={`На ${active.label}`} onRefresh={load}>
        <View style={styles.seg}>
          <Chip label="Ближайший день" selected={mode === 'day'} onPress={() => setMode('day')} />
          <Chip label="История" selected={mode === 'history'} onPress={() => setMode('history')} />
        </View>

        {mode === 'day' ? (
          <>
            <LinearGradient colors={!active.total ? gradients.night : left ? gradients.brand : gradients.ok} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
                <Txt v="largeTitle" color="#fff" style={{ fontSize: 44, lineHeight: 48 }}>
                  {active.done}
                </Txt>
                <Txt v="title" color="rgba(255,255,255,0.7)" style={{ marginBottom: 4 }}>
                  {' '}
                  / {active.total}
                </Txt>
                <View style={{ flex: 1 }} />
                <Txt v="callout" color="rgba(255,255,255,0.85)">
                  🔥 {data.streak} · ⭐ {data.perfect_week}
                </Txt>
              </View>
              <Txt v="headline" color="#fff" style={{ marginTop: 6 }}>
                {!active.total ? 'Заданий пока нет' : left ? `Осталось ${left}` : 'Всё готово 🎉'}
                {active.last_done_hm ? ` · последнее в ${active.last_done_hm}` : ''}
              </Txt>
              <View style={[styles.track, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                <View style={[styles.fill, { width: `${active.total ? (active.done / active.total) * 100 : 0}%` }]} />
              </View>
            </LinearGradient>

            {pending.length || toReview.length ? (
              <View style={[styles.attn, { backgroundColor: p.warnSoft }]}>
                <Txt v="callout" style={{ flex: 1 }}>
                  {pending.length ? `⏳ Ждут ответа: ${pending.length}` : ''}
                  {pending.length && toReview.length ? '   ' : ''}
                  {toReview.length ? `📸 Новые фото: ${toReview.length}` : ''}
                </Txt>
              </View>
            ) : null}

            {!active.total ? (
              <Empty icon="🗓️" title="Добавьте уроки и дела" text="Задания создаются из расписания и списка дел.">
                <Btn title="Открыть расписание" kind="secondary" onPress={() => router.push('/parent/schedule')} style={{ marginTop: 16 }} />
              </Empty>
            ) : (
              <>
                {left ? <Btn title="Напомнить ученику" icon="🔔" kind="secondary" onPress={nudge} style={{ marginTop: 12 }} /> : null}
                {[...pending, ...active.tasks.filter((t) => t.status !== 'skip_pending')]
                  .reduce<{ k: string; items: Task[] }[]>((acc, t) => {
                    const k = t.kind === 'lesson' ? 'Уроки' : 'Подготовить';
                    const g = acc.find((x) => x.k === k) ?? (acc.push({ k, items: [] }), acc[acc.length - 1]);
                    g.items.push(t);
                    return acc;
                  }, [])
                  .map((g) => (
                    <View key={g.k}>
                      <SectionLabel>
                        {g.k} · {g.items.filter(isDone).length}/{g.items.length}
                      </SectionLabel>
                      {g.items.map((t) => (
                        <ParentTaskCard key={t.id} t={t} busy={busy === t.id} onAction={act} onOpen={open} />
                      ))}
                    </View>
                  ))}
              </>
            )}
          </>
        ) : (
          <History days={history} openDay={openDay} setOpenDay={setOpenDay} busy={busy} act={act} open={open} />
        )}
      </Screen>
      <PhotoViewer url={viewer?.url ?? null} caption={viewer?.caption} onClose={() => setViewer(null)} />
      {toast.node}
    </>
  );
}

function History({
  days,
  openDay,
  setOpenDay,
  busy,
  act,
  open,
}: {
  days: Day[];
  openDay: string | null;
  setOpenDay: (d: string | null) => void;
  busy: number | null;
  act: (t: Task, a: ParentAction) => void;
  open: (url: string, caption: string) => void;
}) {
  const p = usePalette();
  if (!days.length) return <Empty icon="📅" title="История пока пуста" text="Здесь будут прошедшие учебные дни." />;
  return (
    <View style={{ marginTop: 12 }}>
      {days.map((d) => {
        const color = !d.total ? p.muted : d.done === d.total ? (d.on_time ? p.ok : p.warn) : p.bad;
        return (
          <View key={d.date} style={{ marginBottom: 10 }}>
            <Group>
              <Pressable onPress={() => setOpenDay(openDay === d.date ? null : d.date)}>
                <Row
                  title={d.label}
                  subtitle={`${d.done}/${d.total}${d.last_done_hm ? ` · до ${d.last_done_hm}` : ''}${d.on_time ? ' · вовремя' : ''}`}
                  right={<View style={[styles.dot, { backgroundColor: color }]} />}
                  chevron
                />
              </Pressable>
            </Group>
            {openDay === d.date ? (
              <View style={{ marginTop: 8 }}>
                {d.tasks.map((t) => (
                  <ParentTaskCard key={t.id} t={t} busy={busy === t.id} onAction={act} onOpen={open} />
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  seg: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  hero: { borderRadius: radius.xl, padding: 18 },
  track: { height: 8, borderRadius: 4, marginTop: 14, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: '#fff' },
  attn: { borderRadius: radius.l, padding: 14, marginTop: 10, flexDirection: 'row' },
  dot: { width: 12, height: 12, borderRadius: 6 },
});
