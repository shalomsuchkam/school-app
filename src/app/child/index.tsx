import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Pressable, StyleSheet, View } from 'react-native';

import { Paywall } from '@/components/Paywall';
import { Confetti } from '@/components/Confetti';
import { PhotoViewer } from '@/components/PhotoViewer';
import { ProgressRing } from '@/components/ProgressRing';
import { SkipSheet } from '@/components/SkipSheet';
import { ChildTaskCard } from '@/components/TaskCards';
import { Btn, Empty, haptic, Loading, Screen, SectionLabel, Txt, useToast } from '@/components/ui';
import { api, ApiError, isPaywall, isDone, type ChildState, type Task } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { duration, longDate, shortDate } from '@/lib/format';
import { t as tr, tn, useT } from '@/lib/i18n';
import { exactAlarmsAllowed, openExactAlarmSettings } from '@/lib/exactAlarm';
import { cancelReminders, notificationsAllowed, scheduleReminders } from '@/lib/notify';
import { gradients, radius, usePalette } from '@/lib/theme';

function hero(s: ChildState, fetchedAt: number, now: number) {
  const req = s.tasks.filter((x) => x.required);
  const done = req.filter(isDone).length;
  const total = req.length;
  const elapsed = Math.max(0, Math.floor((now - fetchedAt) / 60000));
  if (total && done === total) return { g: gradients.ok, t1: tr('child.hero.allDone'), t2: tr('child.hero.allDoneSub'), done, total };
  if (!s.due_today) return { g: gradients.brand, t1: tr('child.hero.dueBy', { date: shortDate(s.due_date) }), t2: tr('child.hero.deadlines', { soft: s.soft, hard: s.hard }), done, total };
  const soft = (s.mins_to_soft ?? 0) - elapsed;
  const hard = (s.mins_to_hard ?? 0) - elapsed;
  if (soft > 0) return { g: soft < 45 ? gradients.warn : gradients.brand, t1: tr('child.hero.timeTo', { dur: duration(soft), soft: s.soft }), t2: tr('child.hero.leftOf', { left: total - done, total }), done, total };
  if (hard > 0) return { g: gradients.bad, t1: tr('child.hero.softPassed', { soft: s.soft }), t2: tr('child.hero.lastIn', { dur: duration(hard) }), done, total };
  return { g: gradients.bad, t1: tr('child.hero.timeUp'), t2: tn('child.hero.leftNow', total - done), done, total };
}

export default function ChildHome() {
  const p = usePalette();
  const t = useT();
  const { signOut } = useAuth();
  const [s, setS] = useState<ChildState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [notifOk, setNotifOk] = useState(true);
  const [exactOk, setExactOk] = useState(true);
  const [paywall, setPaywall] = useState(false);
  const [skip, setSkip] = useState<Task | null>(null);
  const [viewer, setViewer] = useState<{ url: string; caption: string; id: number } | null>(null);
  const [confetti, setConfetti] = useState(0);
  const prevAll = useRef<boolean | null>(null);
  const seq = useRef({ sent: 0, shown: 0 });
  // Last payload we rendered: lets a poll that brought nothing new skip the whole re-render.
  const lastKey = useRef<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    const my = ++seq.current.sent;
    try {
      const st = await api.childState();
      // Overlapping refreshes (focus, poll, resume): never let an older answer overwrite a newer one.
      if (my < seq.current.shown) return;
      seq.current.shown = my;
      setError(null);
      setPaywall(false);
      // Permission banners must refresh even when the data is unchanged (e.g. back from Settings).
      const ok = await notificationsAllowed(false);
      setNotifOk(ok);
      setExactOk(exactAlarmsAllowed());
      // The server hands back fresh object identities (and rotated photo URLs) on every poll, so
      // without this guard setS would re-render the whole tree twice a minute for no reason.
      const key = JSON.stringify({
        tasks: st.tasks.map((tk) => ({ ...tk, photos: tk.photos.map((ph) => ph.id) })),
        streak: st.streak,
        perfect_week: st.perfect_week,
        due_date: st.due_date,
        school_date: st.school_date,
        due_today: st.due_today,
        soft: st.soft,
        hard: st.hard,
        remind_times: st.remind_times,
        upcoming: st.upcoming,
      });
      if (key === lastKey.current) return;
      lastKey.current = key;
      const ts = Date.now();
      setS(st);
      setFetchedAt(ts);
      setNow(ts);
      const req = st.tasks.filter((x) => x.required);
      const all = req.length > 0 && req.every(isDone);
      if (prevAll.current === false && all) {
        setConfetti((c) => c + 1);
        haptic.success();
      }
      prevAll.current = all;
      if (ok && my === seq.current.shown) await scheduleReminders(st);
    } catch (e) {
      if (isPaywall(e)) {
        await cancelReminders();
        setPaywall(true);
        return;
      }
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

  if (paywall) return <Paywall role="child" onActive={load} />;
  if (!s) return <Loading error={error} onRetry={load} />;

  const h = hero(s, fetchedAt, now);
  const schoolLabel = longDate(s.school_date);
  const lessons = s.tasks.filter((x) => x.kind === 'lesson');
  const items = s.tasks.filter((x) => x.kind === 'item');

  const openPhoto = (url: string, caption: string, id: number) => setViewer({ url, caption, id });
  const openCamera = (tk: Task) =>
    router.push({ pathname: '/child/camera', params: { id: String(tk.id), label: tk.label, emoji: tk.emoji, page: String(tk.photos.length + 1) } });
  const check = async (tk: Task, done: boolean) => {
    haptic.tap();
    setS({ ...s, tasks: s.tasks.map((x) => (x.id === tk.id ? { ...x, status: done ? 'done' : 'todo' } : x)) });
    try {
      await api.check(tk.id, done);
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
      toast.show(t('child.skipSent'));
      load();
    } catch (e) {
      toast.show((e as Error).message);
    }
  };
  const enableNotif = async () => {
    const ok = await notificationsAllowed(true);
    setNotifOk(ok);
    if (ok) await scheduleReminders(s);
    toast.show(ok ? t('child.notif.on') : t('child.notif.denied'));
  };
  const logout = () =>
    Alert.alert(t('child.logout.title'), t('child.logout.text'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('child.logout.ok'),
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
            {t('child.greeting', { name: s.name })}
          </Txt>
          <Txt v="largeTitle" style={{ marginTop: 2 }}>
            {schoolLabel.charAt(0).toUpperCase() + schoolLabel.slice(1)}
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
              {tn('child.streak', s.streak)}
            </Txt>
          </View>
          <View style={[styles.stat, { backgroundColor: p.card }]}>
            <Txt v="title">⭐ {s.perfect_week}</Txt>
            <Txt v="sub" color={p.muted}>
              {t('child.perfectWeek')}
            </Txt>
          </View>
        </View>

        {!notifOk ? (
          <View style={[styles.banner, { backgroundColor: p.warnSoft }]}>
            <Txt v="callout" style={{ flex: 1 }}>
              {t('child.notif.banner')}
            </Txt>
            <Btn small title={t('child.notif.enable')} onPress={enableNotif} />
          </View>
        ) : !exactOk ? (
          <View style={[styles.banner, { backgroundColor: p.warnSoft }]}>
            <Txt v="callout" style={{ flex: 1 }}>
              {t('child.exact.banner')}
            </Txt>
            <Btn small title={t('child.exact.allow')} onPress={() => openExactAlarmSettings() || toast.show(t('child.exact.manual'))} />
          </View>
        ) : null}
        {error ? (
          <Txt v="sub" color={p.bad} style={{ marginTop: 8 }}>
            ⚠️ {error}
          </Txt>
        ) : null}

        {!s.tasks.length ? <Empty icon="🌤️" title={t('child.empty.title')} text={t('child.empty.text')} /> : null}
        {lessons.length ? <SectionLabel>{t('child.section.lessons', { done: lessons.filter(isDone).length, total: lessons.length })}</SectionLabel> : null}
        {lessons.map((tk) => (
          <ChildTaskCard key={tk.id} t={tk} onPhoto={openCamera} onSkip={setSkip} onCheck={check} onOpen={openPhoto} />
        ))}
        {items.length ? <SectionLabel>{t('child.section.items', { done: items.filter(isDone).length, total: items.length })}</SectionLabel> : null}
        {items.map((tk) => (
          <ChildTaskCard key={tk.id} t={tk} onPhoto={openCamera} onSkip={setSkip} onCheck={check} onOpen={openPhoto} />
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
