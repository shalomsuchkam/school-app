import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Pressable, StyleSheet, View } from 'react-native';

import { Confetti } from '@/components/Confetti';
import { PhotoViewer } from '@/components/PhotoViewer';
import { ProgressRing } from '@/components/ProgressRing';
import { SkipSheet } from '@/components/SkipSheet';
import { ChildTaskCard } from '@/components/TaskCards';
import { Btn, Empty, haptic, Loading, Screen, SectionLabel, Txt, useToast } from '@/components/ui';
import { api, ApiError, isDone, type ChildState, type Task } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { duration } from '@/lib/format';
import { exactAlarmsAllowed, openExactAlarmSettings } from '@/lib/exactAlarm';
import { cancelReminders, notificationsAllowed, scheduleReminders } from '@/lib/notify';
import { gradients, radius, usePalette } from '@/lib/theme';

function hero(s: ChildState, fetchedAt: number, now: number) {
  const req = s.tasks.filter((t) => t.required);
  const done = req.filter(isDone).length;
  const total = req.length;
  const elapsed = Math.max(0, Math.floor((now - fetchedAt) / 60000));
  if (total && done === total) return { g: gradients.ok, t1: 'Всё готово!', t2: 'Можно отдыхать. Родители уже знают.', done, total };
  if (!s.due_today) return { g: gradients.brand, t1: `Сдать до ${s.due_label}`, t2: `Срок ${s.soft}, последний ${s.hard}`, done, total };
  const soft = (s.mins_to_soft ?? 0) - elapsed;
  const hard = (s.mins_to_hard ?? 0) - elapsed;
  if (soft > 0) return { g: soft < 45 ? gradients.warn : gradients.brand, t1: `${duration(soft)} до ${s.soft}`, t2: `Осталось ${total - done} из ${total}`, done, total };
  if (hard > 0) return { g: gradients.bad, t1: `${s.soft} прошло`, t2: `Последний срок через ${duration(hard)}`, done, total };
  return { g: gradients.bad, t1: 'Время вышло', t2: `Осталось ${total - done}. Сделай сейчас!`, done, total };
}

export default function ChildHome() {
  const p = usePalette();
  const { signOut } = useAuth();
  const [s, setS] = useState<ChildState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [notifOk, setNotifOk] = useState(true);
  const [exactOk, setExactOk] = useState(true);
  const [skip, setSkip] = useState<Task | null>(null);
  const [viewer, setViewer] = useState<{ url: string; caption: string; id: number } | null>(null);
  const [confetti, setConfetti] = useState(0);
  const prevAll = useRef<boolean | null>(null);
  const seq = useRef({ sent: 0, shown: 0 });
  const toast = useToast();

  const load = useCallback(async () => {
    const my = ++seq.current.sent;
    try {
      const st = await api.childState();
      // Overlapping refreshes (focus, poll, resume): never let an older answer overwrite a newer one.
      if (my < seq.current.shown) return;
      seq.current.shown = my;
      const t = Date.now();
      setS(st);
      setFetchedAt(t);
      setNow(t);
      setError(null);
      const req = st.tasks.filter((x) => x.required);
      const all = req.length > 0 && req.every(isDone);
      if (prevAll.current === false && all) {
        setConfetti((c) => c + 1);
        haptic.success();
      }
      prevAll.current = all;
      const ok = await notificationsAllowed(false);
      setNotifOk(ok);
      setExactOk(exactAlarmsAllowed());
      if (ok && my === seq.current.shown) await scheduleReminders(st);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await cancelReminders();
        await signOut();
        router.replace('/welcome');
        return;
      }
      if (my >= seq.current.shown) setError((e as Error).message);
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
    const clock = setInterval(() => setNow(Date.now()), 60000);
    return () => {
      sub.remove();
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [load]);

  if (!s) return <Loading error={error} onRetry={load} />;

  const h = hero(s, fetchedAt, now);
  const lessons = s.tasks.filter((t) => t.kind === 'lesson');
  const items = s.tasks.filter((t) => t.kind === 'item');

  const openPhoto = (url: string, caption: string, id: number) => setViewer({ url, caption, id });
  const openCamera = (t: Task) =>
    router.push({ pathname: '/child/camera', params: { id: String(t.id), label: t.label, emoji: t.emoji, page: String(t.photos.length + 1) } });
  const check = async (t: Task, done: boolean) => {
    haptic.tap();
    setS({ ...s, tasks: s.tasks.map((x) => (x.id === t.id ? { ...x, status: done ? 'done' : 'todo' } : x)) });
    try {
      await api.check(t.id, done);
    } catch (e) {
      toast.show((e as Error).message);
    }
    load();
  };
  const sendSkip = async (reason: string) => {
    if (!skip) return;
    try {
      await api.skip(skip.id, reason);
      setSkip(null);
      toast.show('Запрос отправлен ⏳');
      load();
    } catch (e) {
      toast.show((e as Error).message);
    }
  };
  const enableNotif = async () => {
    const ok = await notificationsAllowed(true);
    setNotifOk(ok);
    if (ok) await scheduleReminders(s);
    toast.show(ok ? 'Напоминания включены 🔔' : 'Разреши уведомления в настройках телефона');
  };
  const logout = () =>
    Alert.alert('Выйти из приложения?', 'Для входа снова понадобится новый код от родителя.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Выйти',
        style: 'destructive',
        onPress: async () => {
          await api.leave().catch(() => {});
          await cancelReminders();
          await signOut();
          router.replace('/welcome');
        },
      },
    ]);

  return (
    <>
      <Screen onRefresh={load}>
        <Pressable onLongPress={logout} delayLongPress={1200}>
          <Txt v="callout" color={p.muted}>
            Привет, {s.name} 👋 Задания на
          </Txt>
          <Txt v="largeTitle" style={{ marginTop: 2 }}>
            {s.school_label.charAt(0).toUpperCase() + s.school_label.slice(1)}
          </Txt>
        </Pressable>

        <LinearGradient colors={h.g} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <ProgressRing done={h.done} total={h.total} />
          <View style={{ flex: 1 }}>
            <Txt v="title" color="#fff">
              {h.t1}
            </Txt>
            <Txt v="callout" color="rgba(255,255,255,0.88)" style={{ marginTop: 4 }}>
              {h.t2}
            </Txt>
          </View>
        </LinearGradient>

        <View style={styles.stats}>
          <View style={[styles.stat, { backgroundColor: p.card }]}>
            <Txt v="title">🔥 {s.streak}</Txt>
            <Txt v="sub" color={p.muted}>
              дней подряд
            </Txt>
          </View>
          <View style={[styles.stat, { backgroundColor: p.card }]}>
            <Txt v="title">⭐ {s.perfect_week}</Txt>
            <Txt v="sub" color={p.muted}>
              вовремя за неделю
            </Txt>
          </View>
        </View>

        {!notifOk ? (
          <View style={[styles.banner, { backgroundColor: p.warnSoft }]}>
            <Txt v="callout" style={{ flex: 1 }}>
              🔔 Включи напоминания, чтобы ничего не забыть
            </Txt>
            <Btn small title="Включить" onPress={enableNotif} />
          </View>
        ) : !exactOk ? (
          <View style={[styles.banner, { backgroundColor: p.warnSoft }]}>
            <Txt v="callout" style={{ flex: 1 }}>
              ⏰ Чтобы напоминания приходили вовремя, разреши «Будильники и напоминания»
            </Txt>
            <Btn small title="Разрешить" onPress={() => openExactAlarmSettings() || toast.show('Открой настройки приложения → Будильники и напоминания')} />
          </View>
        ) : null}
        {error ? (
          <Txt v="sub" color={p.bad} style={{ marginTop: 8 }}>
            ⚠️ {error}
          </Txt>
        ) : null}

        {!s.tasks.length ? <Empty icon="🌤️" title="На этот день заданий нет" text="Родитель ещё не добавил уроки и дела." /> : null}
        {lessons.length ? <SectionLabel>Уроки · {lessons.filter(isDone).length}/{lessons.length}</SectionLabel> : null}
        {lessons.map((t) => (
          <ChildTaskCard key={t.id} t={t} onPhoto={openCamera} onSkip={setSkip} onCheck={check} onOpen={openPhoto} />
        ))}
        {items.length ? <SectionLabel>Подготовить · {items.filter(isDone).length}/{items.length}</SectionLabel> : null}
        {items.map((t) => (
          <ChildTaskCard key={t.id} t={t} onPhoto={openCamera} onSkip={setSkip} onCheck={check} onOpen={openPhoto} />
        ))}
      </Screen>
      {/* While the sheet is open the toast goes inside its modal, otherwise errors would hide under it. */}
      <SkipSheet task={skip} onClose={() => setSkip(null)} onSend={sendSkip} overlay={skip ? toast.node : null} />
      <PhotoViewer url={viewer?.url ?? null} id={viewer?.id} caption={viewer?.caption} onClose={() => setViewer(null)} />
      <Confetti run={confetti} />
      {skip ? null : toast.node}
    </>
  );
}

const styles = StyleSheet.create({
  hero: { marginTop: 16, borderRadius: radius.xl, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 16 },
  stats: { flexDirection: 'row', gap: 10, marginTop: 10 },
  stat: { flex: 1, borderRadius: radius.l, padding: 14 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.l, padding: 14, marginTop: 10 },
});
