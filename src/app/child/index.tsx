import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { Alert, AppState, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Paywall } from '@/components/Paywall';
import { Confetti } from '@/components/Confetti';
import { PhotoViewer } from '@/components/PhotoViewer';
import { ProgressRing } from '@/components/ProgressRing';
import { NoteSheet, SkipSheet } from '@/components/SkipSheet';
import { ChildTaskCard } from '@/components/TaskCards';
import { Banner, Btn, Card, CONTENT_MAX, Empty, ErrorBanner, haptic, Icon, type IconName, IconTile, Loading, PressableScale, ProgressBar, Screen, SectionLabel, Stat, Txt, useLayout, useToast } from '@/components/ui';
import { api, ApiError, isPaywall, isDone, type ChildState, type Task } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { duration, longDate, shortDate } from '@/lib/format';
import { t as tr, tn, useT } from '@/lib/i18n';
import { exactAlarmsAllowed, openExactAlarmSettings } from '@/lib/exactAlarm';
import { flushQueue, pendingPhotos, usePhotoQueue, type FlushResult } from '@/lib/offline';
import { cancelReminders, notificationsAllowed, scheduleReminders } from '@/lib/notify';
import { elevation, radius, space, usePalette } from '@/lib/theme';
import { syncWidget } from '@/lib/widget';

type Mood = 'zero' | 'progress' | 'almost' | 'done' | 'overdue';
const moodIcon: Record<Mood, IconName> = { zero: 'flag-outline', progress: 'trending-up', almost: 'flash-outline', done: 'trophy', overdue: 'hourglass-outline' };

function hero(s: ChildState, fetchedAt: number, now: number) {
  const req = s.tasks.filter((x) => x.required);
  const done = req.filter(isDone).length;
  const total = req.length;
  const left = total - done;
  const elapsed = Math.max(0, Math.floor((now - fetchedAt) / 60000));
  const soft = (s.mins_to_soft ?? 0) - elapsed;
  const hard = (s.mins_to_hard ?? 0) - elapsed;
  // Past the soft deadline on the due day: unfinished cards turn red and the hero says "hurry".
  const overdue = s.due_today && soft <= 0 && left > 0;
  // A short, kid-friendly line that follows progress (none when the day has no required tasks).
  const mood: Mood | null = !total ? null : !left ? 'done' : overdue ? 'overdue' : !done ? 'zero' : left === 1 || done / total >= 0.75 ? 'almost' : 'progress';
  const base = { done, total, left, overdue, mood };
  // tone: the colour of the time line and the ring (brand = on track, warn = under 45 min, bad = past the deadline)
  if (total && done === total) return { ...base, tone: 'ok' as const, t1: tr('child.hero.allDone'), t2: tr('child.hero.allDoneSub') };
  if (!s.due_today) return { ...base, tone: 'brand' as const, t1: tr('child.hero.dueBy', { date: shortDate(s.due_date) }), t2: tr('child.hero.deadlines', { soft: s.soft, hard: s.hard }) };
  if (soft > 0) return { ...base, tone: soft < 45 ? ('warn' as const) : ('brand' as const), t1: tr('child.hero.timeTo', { dur: duration(soft), soft: s.soft }), t2: tr('child.hero.leftOf', { left, total }) };
  if (hard > 0) return { ...base, tone: 'bad' as const, t1: tr('child.hero.softPassed', { soft: s.soft }), t2: tr('child.hero.lastIn', { dur: duration(hard) }) };
  return { ...base, tone: 'bad' as const, t1: tr('child.hero.timeUp'), t2: tn('child.hero.leftNow', left) };
}

// The one thing to do next: a retake the parent asked for, then any photo task, then a simple tick.
// Tasks whose photo already waits in the offline queue are not "next" any more.
function nextTask(tasks: Task[], queued: Set<number>) {
  const open = tasks.filter((x) => x.required && !isDone(x) && x.status !== 'skip_pending' && !queued.has(x.id));
  return open.find((x) => x.status === 'redo') ?? open.find((x) => x.needs_photo) ?? open[0] ?? null;
}

// "18:05" in the family's time zone (falls back to the device zone).
function hmOf(iso: string, tz: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(d);
  } catch {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}

// Minutes at homework: until now, or until the last tick once everything required is done.
function sessionMinutes(s: ChildState, now: number, allDone: boolean) {
  if (!s.started_at) return null;
  const from = Date.parse(s.started_at);
  if (Number.isNaN(from)) return null;
  let to = now;
  if (allDone) {
    const ends = s.tasks.map((x) => (x.done_at ? Date.parse(x.done_at) : NaN)).filter((x) => !Number.isNaN(x));
    if (ends.length) to = Math.max(...ends);
  }
  return Math.max(0, Math.floor((to - from) / 60000));
}

// The one next step, pinned in thumb reach above the home indicator. Springs in; fades out.
function NextAction({ task, onPress }: { task: Task; onPress: () => void }) {
  const p = usePalette();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { pad } = useLayout();
  const reduce = useReducedMotion();
  const title = task.needs_photo ? t(task.status === 'redo' ? 'child.next.redo' : 'child.next.photo', { label: task.label }) : t('child.next.check', { label: task.label });
  return (
    <Animated.View
      entering={reduce ? FadeIn.duration(160) : FadeInDown.springify().damping(20)}
      exiting={reduce ? FadeOut.duration(120) : FadeOutDown.duration(160)}
      pointerEvents="box-none"
      style={[styles.nextWrap, { paddingHorizontal: pad, paddingBottom: insets.bottom + 12 }]}
    >
      <PressableScale
        onPress={() => {
          haptic.tap();
          onPress();
        }}
        accessibilityRole="button"
        accessibilityLabel={`${t('child.next.caption')}: ${title}`}
        style={[styles.nextBtn, elevation(p, 2), { backgroundColor: p.brandFill }]}
      >
        <View style={styles.nextIcon}>
          <Icon name={task.needs_photo ? 'camera' : 'checkmark'} size={22} color={p.brandFill} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt v="sub" color="rgba(255,255,255,0.78)" numberOfLines={1} style={{ fontWeight: '600' }}>
            {t('child.next.caption')}
          </Txt>
          <Txt v="headline" color="#fff" numberOfLines={2}>
            {task.emoji} {title}
          </Txt>
        </View>
        <Icon name="arrow-forward" size={20} color="#fff" />
      </PressableScale>
    </Animated.View>
  );
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
  const [noteFor, setNoteFor] = useState<Task | null>(null);
  const [starting, setStarting] = useState(false);
  // Bumped by a successful load while photos wait offline: the effect below then sends them.
  const [onlineTick, setOnlineTick] = useState(0);
  const queue = usePhotoQueue();
  const prevAll = useRef<boolean | null>(null);
  const seq = useRef({ sent: 0, shown: 0 });
  // Last payload we rendered: lets a poll that brought nothing new skip the whole re-render.
  const lastKey = useRef<string | null>(null);
  // photo links are signed for 15 min: an unchanged payload is still applied every 10 min to renew them
  const lastAt = useRef(0);
  const toast = useToast();
  const reduce = useReducedMotion();
  const { width } = useWindowDimensions();
  const ringSize = width < 360 ? 84 : width >= 700 ? 120 : 104;
  const toneFg = { ok: p.ok, brand: p.brand, warn: p.warn, bad: p.bad };

  const load = useCallback(async () => {
    const my = ++seq.current.sent;
    try {
      const st = await api.childState();
      // Overlapping refreshes (focus, poll, resume): never let an older answer overwrite a newer one.
      if (my < seq.current.shown) return;
      seq.current.shown = my;
      setError(null);
      setPaywall(false);
      // The server answered, so we are online: send photos saved offline (no re-render when there are none).
      setOnlineTick((n) => (n === 0 || pendingPhotos() > 0 ? n + 1 : n));
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
        reward: st.reward,
        track_time: st.track_time,
        started_at: st.started_at,
      });
      if (key === lastKey.current && Date.now() - lastAt.current < 600_000) return;
      lastKey.current = key;
      const ts = Date.now();
      lastAt.current = ts;
      setS(st);
      syncWidget(st); // home-screen widget (Android): what is left for the next school day
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
  const onFlushed = useEffectEvent((r: FlushResult) => {
    if (r.sent) {
      toast.show(tn('child.queue.sent', r.sent));
      lastKey.current = null;
      load();
    } else if (r.dropped) toast.show(tn('child.queue.dropped', r.dropped));
  });
  const hasQueue = queue.length > 0;
  useEffect(() => {
    if (!onlineTick || !hasQueue) return;
    flushQueue()
      .then((r) => onFlushed(r))
      .catch(() => {}); // photos stay queued; the next successful load tries again
  }, [onlineTick, hasQueue]);

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
  const queuedBy = new Map<number, number>();
  for (const q of queue) queuedBy.set(q.task_id, (queuedBy.get(q.task_id) ?? 0) + 1);
  const next = nextTask([...lessons, ...items], new Set(queuedBy.keys()));
  const allDone = h.total > 0 && h.left === 0;
  const startedHm = s.started_at ? hmOf(s.started_at, s.tz) : null;
  const mins = s.track_time ? sessionMinutes(s, now, allDone) : null;
  const showStart = s.track_time && !s.started_at && h.left > 0;
  const reward = s.reward && s.reward.goal > 0 ? s.reward : null;
  const rewardLeft = reward ? Math.max(0, reward.goal - s.streak) : 0;
  const rewardPct = reward ? Math.min(1, s.streak / reward.goal) : 0;

  const openPhoto = (url: string, caption: string, id: number) => setViewer({ url, caption, id });
  const openCamera = (tk: Task) =>
    router.push({ pathname: '/child/camera', params: { id: String(tk.id), label: tk.label, emoji: tk.emoji, page: String(tk.photos.length + 1) } });
  const check = async (tk: Task, done: boolean) => {
    haptic.tap();
    setS({ ...s, tasks: s.tasks.map((x) => (x.id === tk.id ? { ...x, status: done ? 'done' : 'todo' } : x)) });
    // The optimistic state differs from the last payload: let the next load render even if unchanged.
    lastKey.current = null;
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
  const saveNote = async (tk: Task, text: string) => {
    setNoteFor(null);
    const prev = tk.note;
    if ((prev ?? '') === text) return;
    const put = (note: string | null) => setS((cur) => (cur ? { ...cur, tasks: cur.tasks.map((x) => (x.id === tk.id ? { ...x, note } : x)) } : cur));
    put(text || null);
    lastKey.current = null;
    try {
      await api.childNote(tk.id, text);
    } catch (e) {
      put(prev);
      toast.show(`${t('child.note.saveFail')}: ${(e as Error).message}`);
    }
    load();
  };
  const startSession = async () => {
    haptic.tap();
    setStarting(true);
    try {
      const r = await api.startSession();
      const ts = Date.now();
      setS((cur) => (cur ? { ...cur, started_at: r.started_at ?? new Date(ts).toISOString() } : cur));
      setNow(ts);
      lastKey.current = null;
    } catch (e) {
      toast.show((e as Error).message);
    } finally {
      setStarting(false);
    }
  };
  const enableNotif = async () => {
    const ok = await notificationsAllowed(true);
    setNotifOk(ok);
    if (ok) {
      try {
        await scheduleReminders(s);
      } catch {} // permission is granted; the next load schedules them again
    }
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
      <Screen onRefresh={load} footer={next ? <NextAction key={next.id} task={next} onPress={() => (next.needs_photo ? openCamera(next) : check(next, true))} /> : null}>
        <Pressable onLongPress={logout} delayLongPress={1200}>
          <Txt v="callout" color={p.muted}>
            {t('child.greeting', { name: s.name })}
          </Txt>
          <Txt v="largeTitle" accessibilityRole="header" style={{ marginTop: 2 }}>
            {schoolLabel.charAt(0).toUpperCase() + schoolLabel.slice(1)}
          </Txt>
        </Pressable>

        {/* Hero: how far along, and how much time is left. Colour only where it carries meaning. */}
        <Card tone={allDone ? 'ok' : undefined} style={styles.hero}>
          <View style={styles.heroRow}>
            <ProgressRing done={h.done} total={h.total} size={ringSize} color={allDone ? p.okFill : h.tone === 'bad' ? p.bad : h.tone === 'warn' ? p.warn : p.brand} track={allDone ? p.card : p.fill} />
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <View style={styles.timeRow}>
                <Icon name={allDone ? 'checkmark-circle' : h.tone === 'bad' ? 'alert-circle' : 'time-outline'} size={17} color={toneFg[h.tone]} />
                <Txt v="sub" color={toneFg[h.tone]} style={{ fontWeight: '600', flexShrink: 1 }} numberOfLines={2}>
                  {h.t2}
                </Txt>
              </View>
              <Txt v="title" color={p.ink}>
                {h.t1}
              </Txt>
            </View>
          </View>
          {h.mood ? (
            // Re-keyed per mood so the line eases in again each time progress reaches a new stage.
            <Animated.View key={h.mood} entering={reduce ? FadeIn.duration(200) : FadeInDown.duration(260)} style={[styles.mood, { borderTopColor: allDone ? 'rgba(29,115,70,0.18)' : p.line }]}>
              <Icon name={moodIcon[h.mood]} size={18} color={allDone ? p.ok : p.brand} />
              <Txt v={h.mood === 'done' ? 'headline' : 'callout'} color={allDone ? p.ok : p.ink2} style={{ flex: 1 }}>
                {h.mood === 'done' ? t('child.mood.done') : tn(`child.mood.${h.mood}`, h.left)}
              </Txt>
            </Animated.View>
          ) : null}
        </Card>

        {showStart ? (
          <Card style={{ marginTop: space.xs, gap: space.xs }}>
            <Btn title={t('child.time.start')} icon="play" onPress={startSession} loading={starting} />
            <Txt v="sub" color={p.muted} style={{ textAlign: 'center' }}>
              {t('child.time.hint')}
            </Txt>
          </Card>
        ) : null}

        {queue.length ? <Banner tone="warn" icon="cloud-upload-outline" title={t('child.queue.badge', { n: queue.length })} text={t('child.queue.badgeHint')} live /> : null}

        {!notifOk ? (
          <Banner tone="brand" icon="notifications-outline" text={t('child.notif.banner')} action={{ label: t('child.notif.enable'), onPress: enableNotif }} />
        ) : !exactOk ? (
          <Banner tone="brand" icon="alarm-outline" text={t('child.exact.banner')} action={{ label: t('child.exact.allow'), onPress: () => openExactAlarmSettings() || toast.show(t('child.exact.manual')) }} />
        ) : null}
        {error ? (
          <View style={{ marginTop: space.xs }}>
            <ErrorBanner error={error} onRetry={load} />
          </View>
        ) : null}

        {!s.tasks.length ? <Empty icon="sunny-outline" title={t('child.empty.title')} text={t('child.empty.text')} /> : null}
        {lessons.length ? <SectionLabel>{t('child.section.lessons', { done: lessons.filter(isDone).length, total: lessons.length })}</SectionLabel> : null}
        {lessons.map((tk) => (
          <ChildTaskCard key={tk.id} t={tk} onPhoto={openCamera} onSkip={setSkip} onCheck={check} onOpen={openPhoto} onNote={setNoteFor} overdue={h.overdue} queued={queuedBy.get(tk.id) ?? 0} />
        ))}
        {items.length ? <SectionLabel>{t('child.section.items', { done: items.filter(isDone).length, total: items.length })}</SectionLabel> : null}
        {items.map((tk) => (
          <ChildTaskCard key={tk.id} t={tk} onPhoto={openCamera} onSkip={setSkip} onCheck={check} onOpen={openPhoto} overdue={h.overdue} queued={queuedBy.get(tk.id) ?? 0} />
        ))}

        {/* Progress beyond today: the streak, the reward it leads to, and today's time at homework. */}
        <View style={styles.stats}>
          <Stat icon="flame" iconColor={p.tile.orange} value={s.streak} label={tn('child.streak', s.streak)} />
          <Stat icon="star" iconColor={p.brand} value={s.perfect_week} label={t('child.perfectWeek')} />
        </View>
        {(s.track_time && startedHm) || reward ? (
          <View style={styles.cards}>
            {s.track_time && startedHm ? (
              <Card style={styles.card}>
                <View style={styles.cardRow}>
                  <IconTile icon="timer-outline" size={40} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt v="headline">{t('child.time.started', { hm: startedHm })}</Txt>
                    {mins !== null ? (
                      <Txt v="sub" color={p.muted} style={{ marginTop: 2 }}>
                        {t('child.time.elapsed', { dur: duration(mins) })}
                      </Txt>
                    ) : null}
                  </View>
                </View>
              </Card>
            ) : null}
            {reward ? (
              <Card tone={rewardLeft ? undefined : 'ok'} style={styles.card}>
                <View style={styles.cardRow}>
                  <IconTile icon="gift" size={40} tone={rewardLeft ? 'brand' : 'ok'} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt v="sub" color={p.muted} style={{ fontWeight: '600' }}>
                      {t('child.reward.title')}
                    </Txt>
                    <Txt v="headline">{reward.text}</Txt>
                  </View>
                </View>
                <View
                  accessible
                  accessibilityRole="progressbar"
                  accessibilityLabel={t('child.reward.a11y', { streak: Math.min(s.streak, reward.goal), goal: reward.goal })}
                  accessibilityValue={{ min: 0, max: reward.goal, now: Math.min(s.streak, reward.goal) }}
                  style={styles.barRow}
                >
                  <ProgressBar value={rewardPct} color={rewardLeft ? p.brand : p.okFill} track={rewardLeft ? p.fill : p.card} style={{ flex: 1 }} />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <Icon name="flame" size={14} color={p.tile.orange} />
                    <Txt v="sub" color={p.ink2} style={{ fontVariant: ['tabular-nums'], fontWeight: '600' }}>
                      {Math.min(s.streak, reward.goal)}/{reward.goal}
                    </Txt>
                  </View>
                </View>
                <Txt v={rewardLeft ? 'sub' : 'callout'} color={rewardLeft ? p.muted : p.ok} style={rewardLeft ? undefined : { fontWeight: '600' }}>
                  {rewardLeft ? tn('child.reward.left', rewardLeft) : t('child.reward.earned')}
                </Txt>
              </Card>
            ) : null}
          </View>
        ) : null}
      </Screen>
      {/* While the sheet is open the toast goes inside its modal, otherwise errors would hide under it. */}
      <SkipSheet task={skip} onClose={() => setSkip(null)} onSend={sendSkip} overlay={skip ? toast.node : null} />
      <NoteSheet task={noteFor} onClose={() => setNoteFor(null)} onSave={(text) => noteFor && saveNote(noteFor, text)} overlay={noteFor ? toast.node : null} />
      <PhotoViewer url={viewer?.url ?? null} id={viewer?.id} caption={viewer?.caption} onClose={() => setViewer(null)} />
      <Confetti run={confetti} />
      {skip || noteFor ? null : toast.node}
    </>
  );
}

const styles = StyleSheet.create({
  hero: { marginTop: space.m, padding: space.m, gap: space.s },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  mood: { flexDirection: 'row', alignItems: 'center', gap: space.xs, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.s },
  nextWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  nextBtn: { width: '100%', maxWidth: CONTENT_MAX, flexDirection: 'row', alignItems: 'center', gap: space.s, borderRadius: radius.l, paddingVertical: space.s, paddingLeft: space.s, paddingRight: space.m, minHeight: 64 },
  nextIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', gap: space.xs, marginTop: space.l },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.xs },
  // Side by side on tablets / landscape, stacked on phones.
  card: { flexGrow: 1, flexBasis: 280, gap: space.s },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
