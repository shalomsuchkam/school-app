import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState, Clipboard, Pressable, StyleSheet, View } from 'react-native';

import { ChatSheet } from '@/components/ChatSheet';
import { Paywall } from '@/components/Paywall';
import { PhoneLimitGuide } from '@/components/PhoneLimitGuide';
import { PhotoViewer } from '@/components/PhotoViewer';
import { ParentTaskCard } from '@/components/TaskCards';
import { Badge, Banner, Btn, Card, Empty, ErrorBanner, Field, Group, haptic, Icon, IconBtn, Loading, PressableScale, Row, Screen, SectionLabel, Segmented, SegmentBar, Sheet, Txt, useLayout, useToast } from '@/components/ui';
import { api, isDone, isPaywall, type Child, type Day, type Me, type Overview, type ParentAction, type Task } from '@/lib/api';
import { useAuth, useIsViewer } from '@/lib/auth';
import { deviceSignedOut } from '@/lib/sessionStore';
import { ChildSwitcher, currentChildReady, getCurrentChild, setCurrentChild, useCurrentChild } from '@/lib/currentChild';
import { lastSeen, longDate, toMin } from '@/lib/format';
import { tn, useT } from '@/lib/i18n';
import { elevation, radius, space, usePalette } from '@/lib/theme';

// What the parent edits in the task sheet: a comment for "retake", a free comment, or the assignment note.
type ToolMode = 'redo' | 'comment' | 'note';
type Tool = { task: Task; mode: ToolMode; text: string; initial: string };

const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
// The family's calendar date (the server reasons in the family time zone).
function todayIn(tz: string) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}

export default function Today() {
  const p = usePalette();
  const { signOut } = useAuth();
  const t = useT();
  const [data, setData] = useState<Overview | null>(null);
  const [kids, setKids] = useState<Child[]>([]);
  const [childId] = useCurrentChild(kids);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'day' | 'history'>('day');
  const [busy, setBusy] = useState<number | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [photo, setPhoto] = useState<{ url: string; caption: string; id: number } | null>(null);
  const [paywall, setPaywall] = useState(false);
  const [hard, setHard] = useState<string | null>(null);
  const [today, setToday] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool | null>(null);
  // the sheet keeps its last content while it slides away
  const [toolOpen, setToolOpen] = useState(false);
  const [toolBusy, setToolBusy] = useState(false);
  const [guide, setGuide] = useState(false);
  const [chat, setChat] = useState<Task | null>(null);
  const viewer = useIsViewer();
  const seq = useRef({ sent: 0, shown: 0 });
  // Last payload we rendered: lets a poll that brought nothing new skip the whole re-render.
  const lastKey = useRef<string | null>(null);
  // photo links are signed for 15 min: an unchanged payload is still applied every 10 min to renew them
  const lastAt = useRef(0);
  const toast = useToast();
  const { pad } = useLayout();

  const load = useCallback(async () => {
    const my = ++seq.current.sent;
    try {
      const cid = await currentChildReady();
      const [ov, me] = await Promise.all([api.overview(cid ?? undefined), api.me()]);
      // the parent switched to another child meanwhile: that request's answer wins
      if (getCurrentChild() !== cid) return;
      // Overlapping refreshes (focus, poll, resume, actions): never let an older answer overwrite a newer one.
      if (my < seq.current.shown) return;
      seq.current.shown = my;
      setError(null);
      setPaywall(false);
      const key = overviewKey(ov, me);
      if (key === lastKey.current && Date.now() - lastAt.current < 600_000) return;
      lastKey.current = key;
      lastAt.current = Date.now();
      setData(ov);
      setKids(me.children);
      setHard(me.family.hard_deadline);
      setToday(todayIn(me.family.tz));
    } catch (e) {
      if (isPaywall(e)) return setPaywall(true);
      if (await deviceSignedOut(e)) {
        await signOut();
        router.replace('/welcome');
        return;
      }
      if (my >= seq.current.shown) setError((e as Error).message);
    }
  }, [signOut]);

  // Refresh on focus, on return to the app and every 30 s, but only while this tab is on screen.
  useFocusEffect(
    useCallback(() => {
      load();
      const sub = AppState.addEventListener('change', (st) => st === 'active' && load());
      const poll = setInterval(load, 30000);
      return () => {
        sub.remove();
        clearInterval(poll);
      };
    }, [load]),
  );

  if (paywall) return <Paywall role="parent" onActive={load} />;
  if (!data) return <Loading error={error} onRetry={load} />;

  // the server restores the task exactly as it was before the last action (photos, skip request)
  const undo = (task: Task) =>
    api
      .action(task.id, 'undo')
      .then(
        (r) => toast.show(r.text),
        (e: Error) => toast.show(e.message),
      )
      .finally(load);
  const run = async (task: Task, a: ParentAction, comment?: string) => {
    setBusy(task.id);
    try {
      const r = await api.action(task.id, a, comment);
      toast.show(r.text, a === 'reset' ? undefined : { label: t('parent.undo'), run: () => undo(task) });
      await load();
    } catch (e) {
      toast.show((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const openTool = (task: Task, mode: ToolMode) => {
    const initial = mode === 'comment' ? (task.parent_comment ?? '') : mode === 'note' ? (task.note ?? '') : '';
    setTool({ task, mode, text: initial, initial });
    setToolOpen(true);
  };
  // "Retake" first asks what to fix (optional), then sends it with the action
  const act = (task: Task, a: ParentAction) => (a === 'redo' ? openTool(task, 'redo') : run(task, a));
  const submitTool = async () => {
    if (!tool) return;
    const { task, mode } = tool;
    const text = tool.text.trim();
    if (mode === 'redo') {
      setToolOpen(false);
      return run(task, 'redo', text || undefined);
    }
    setToolBusy(true);
    try {
      if (mode === 'comment') toast.show((await api.action(task.id, 'comment', text)).text);
      else {
        await api.parentNote(task.id, text);
        toast.show(t('parent.task.saved'));
      }
      setToolOpen(false);
      await load();
    } catch (e) {
      toast.show((e as Error).message);
    } finally {
      setToolBusy(false);
    }
  };
  const nudge = async () => {
    try {
      const r = await api.nudge(data.child_id);
      toast.show(!r.left ? t('parent.today.allDone') : r.sent ? t('parent.today.nudgeSent') : t('parent.today.pushLater'));
    } catch (e) {
      toast.show((e as Error).message);
    }
  };
  const open = (url: string, caption: string, id: number) => setPhoto({ url, caption, id });
  const switchChild = (id: number | null) => {
    if (id === null || id === data.child_id) return;
    setCurrentChild(id);
    setOpenDay(null);
    // show loading, not the previous child's tasks (an action there would hit the wrong child)
    setData(null);
    setError(null);
    lastKey.current = null;
    load();
  };

  const active = data.days.find((d) => d.date === data.active)!;
  const history = data.days.filter((d) => d.date !== data.active);
  const left = active.total - active.done;
  const pending = active.tasks.filter((x) => x.status === 'skip_pending');
  const toReview = active.tasks.filter((x) => x.status === 'done' && x.needs_photo && !x.accepted);
  // after the hard deadline on the due day (the day before the active school day) with required work left
  const unfinished = active.tasks.filter((x) => x.required && !isDone(x)).length;
  const overdue = !!hard && today === addDays(data.active, -1) && toMin(data.now_hm) >= toMin(hard) && unfinished > 0;
  // the active day split by state, for the status bar
  const counts = active.tasks.reduce(
    (c, x) => {
      if (x.status === 'skip_pending') c.wait++;
      else if (x.status === 'redo' || x.status === 'skip_no') c.bad++;
      else if (isDone(x)) c.ok++;
      return c;
    },
    { ok: 0, wait: 0, bad: 0 },
  );
  // the chat sheet reports the real count back: the badge updates before the next poll
  const setCount = (taskId: number, n: number) =>
    setData((cur) => (cur ? { ...cur, days: cur.days.map((d) => ({ ...d, tasks: d.tasks.map((x) => (x.id === taskId && x.messages !== n ? { ...x, messages: n } : x)) })) } : cur));
  const pasteNote = async () => {
    if (!tool) return;
    try {
      const text = (await Clipboard.getString()).trim();
      if (!text) return toast.show(t('parent.task.pasteEmpty'));
      setTool({ ...tool, text: text.slice(0, 300) });
    } catch {
      toast.show(t('parent.task.pasteEmpty'));
    }
  };
  const seen = lastSeen(data.child_seen);
  const toolTitle = !tool ? '' : tool.mode === 'redo' ? t('parent.task.redoTitle') : tool.mode === 'comment' ? t('parent.task.comment') : t('parent.task.note');

  return (
    <>
      <Screen
        title={kids.find((c) => c.id === data.child_id)?.name || data.child_name || t('parent.tab.today')}
        subtitle={t('parent.today.subtitle', { date: longDate(active.date) })}
        onRefresh={load}
        right={
          <View style={styles.headBtns}>
            <IconBtn icon="calendar-outline" label={t('parent.cal.open')} onPress={() => router.push('/parent/calendar')} />
            <IconBtn icon="stats-chart-outline" label={t('parent.today.report')} onPress={() => router.push('/parent/report')} />
          </View>
        }
        footer={
          mode === 'day' && left > 0 && !viewer ? (
            <View pointerEvents="box-none" style={[styles.fabWrap, { paddingHorizontal: pad }]}>
              <PressableScale accessibilityRole="button" accessibilityLabel={t('parent.today.nudge')} onPress={() => (haptic.tap(), nudge())} style={[styles.fab, elevation(p, 2), { backgroundColor: p.brandFill }]}>
                <Icon name="notifications" size={18} color="#fff" />
                <Txt v="label" color="#fff">
                  {t('parent.today.nudge')}
                </Txt>
              </PressableScale>
            </View>
          ) : null
        }
      >
        {seen ? (
          <View style={styles.seen} accessible accessibilityLabel={`${kids.find((c) => c.id === data.child_id)?.name ?? data.child_name}: ${seen.text}`}>
            <View style={[styles.seenDot, { backgroundColor: seen.online ? p.okFill : p.border }]} />
            <Txt v="sub" color={p.muted}>
              {seen.text}
            </Txt>
          </View>
        ) : null}
        <ChildSwitcher list={kids} value={childId} onChange={switchChild} />
        <ErrorBanner error={error} onRetry={load} />
        {viewer ? <Banner tone="neutral" icon="eye-outline" text={t('parent.viewerMode.banner')} /> : null}
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'day', label: t('parent.today.segDay') },
            { value: 'history', label: t('parent.today.segHistory') },
          ]}
          style={{ marginBottom: space.s }}
        />

        {mode === 'day' ? (
          <>
            {/* Status at a glance: count, a bar split by state, and what needs the parent now. */}
            <Card tone={active.total && !left ? 'ok' : undefined} style={styles.hero}>
              <View style={styles.heroTop}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }} accessible accessibilityLabel={t('child.ring.a11y', { done: active.done, total: active.total })}>
                  <Txt v="display" style={{ fontVariant: ['tabular-nums'] }}>
                    {active.done}
                  </Txt>
                  <Txt v="title" color={p.muted} style={{ fontVariant: ['tabular-nums'] }}>
                    /{active.total}
                  </Txt>
                </View>
                <View style={{ flex: 1 }} />
                <View style={styles.streaks}>
                  <View style={styles.streak} accessible accessibilityLabel={tn('child.streak', data.streak)}>
                    <Icon name="flame" size={16} color={p.tile.orange} />
                    <Txt v="callout" style={{ fontWeight: '600', fontVariant: ['tabular-nums'] }}>
                      {data.streak}
                    </Txt>
                  </View>
                  <View style={styles.streak} accessible accessibilityLabel={`${data.perfect_week} ${t('child.perfectWeek')}`}>
                    <Icon name="star" size={15} color={p.brand} />
                    <Txt v="callout" style={{ fontWeight: '600', fontVariant: ['tabular-nums'] }}>
                      {data.perfect_week}
                    </Txt>
                  </View>
                </View>
              </View>
              <Txt v="headline" color={active.total && !left ? p.ok : p.ink}>
                {!active.total ? t('parent.today.none') : left ? t('parent.today.left', { n: left }) : t('parent.today.ready')}
                <Txt v="callout" color={p.muted}>
                  {active.last_done_hm ? t('parent.today.lastAt', { hm: active.last_done_hm }) : ''}
                </Txt>
              </Txt>
              <SegmentBar
                height={10}
                track={active.total && !left ? p.card : p.fill}
                parts={[
                  { value: counts.ok, color: p.okFill },
                  { value: counts.wait, color: p.warn },
                  { value: counts.bad, color: p.bad },
                  { value: Math.max(0, active.total - counts.ok - counts.wait - counts.bad), color: 'transparent' },
                ]}
              />
              {pending.length || toReview.length ? (
                <View style={styles.attn}>
                  {pending.length ? <Badge tone="warn" icon="hourglass-outline" label={t('parent.today.pending', { n: pending.length })} /> : null}
                  {toReview.length ? <Badge tone="brand" icon="images-outline" label={t('parent.today.newPhotos', { n: toReview.length })} /> : null}
                </View>
              ) : null}
            </Card>

            {active.override_note ? <Banner tone="brand" icon="swap-horizontal" title={t('common.overrideTitle')} text={active.override_note} /> : null}

            {overdue && !viewer ? (
              <Banner
                tone="bad"
                icon="phone-portrait-outline"
                title={t('parent.today.overdueTitle')}
                text={tn('parent.today.overdueText', unfinished, { hm: hard ?? '' })}
                action={{ label: t('parent.today.overdueBtn'), icon: 'lock-closed-outline', onPress: () => setGuide(true) }}
              />
            ) : null}

            {!active.total ? (
              <Card style={{ marginTop: space.xs }}>
                <Empty icon="calendar-outline" title={t('parent.today.emptyTitle')} text={t('parent.today.emptyText')}>
                  {viewer ? null : <Btn title={t('parent.today.openSchedule')} kind="secondary" onPress={() => router.push('/parent/schedule')} style={{ marginTop: space.m }} />}
                </Empty>
              </Card>
            ) : (
              <>
                {[...pending, ...active.tasks.filter((x) => x.status !== 'skip_pending')]
                  .reduce<{ k: string; items: Task[] }[]>((acc, task) => {
                    const k = task.kind === 'lesson' ? t('parent.today.groupLessons') : task.category === 'home' ? t('parent.today.groupHome') : t('parent.today.groupPrep');
                    const g = acc.find((x) => x.k === k) ?? (acc.push({ k, items: [] }), acc[acc.length - 1]);
                    g.items.push(task);
                    return acc;
                  }, [])
                  .map((g) => (
                    <View key={g.k}>
                      <SectionLabel>
                        {g.k} · {g.items.filter(isDone).length}/{g.items.length}
                      </SectionLabel>
                      {g.items.map((x) => (
                        <TaskBlock key={x.id} x={x} busy={busy === x.id} act={act} open={open} tool={openTool} overdue={overdue} viewer={viewer} chat={setChat} />
                      ))}
                    </View>
                  ))}
              </>
            )}
            <Btn title={t('parent.today.report')} icon="stats-chart-outline" kind="ghost" onPress={() => router.push('/parent/report')} style={{ marginTop: space.s }} />
          </>
        ) : (
          <History days={history} openDay={openDay} setOpenDay={setOpenDay} busy={busy} act={act} open={open} tool={openTool} viewer={viewer} chat={setChat} />
        )}
      </Screen>
      <PhotoViewer url={photo?.url ?? null} id={photo?.id} caption={photo?.caption} onClose={() => setPhoto(null)} />
      <Sheet visible={toolOpen} title={toolTitle} onClose={() => setToolOpen(false)} overlay={toolOpen ? toast.node : null}>
        {tool ? (
          <>
            <Txt v="headline" style={{ marginBottom: 10 }} numberOfLines={2}>
              {tool.task.emoji} {tool.task.label}
            </Txt>
            <Field
              value={tool.text}
              onChangeText={(text) => setTool({ ...tool, text })}
              placeholder={t(tool.mode === 'redo' ? 'parent.task.redoPh' : tool.mode === 'comment' ? 'parent.task.commentPh' : 'parent.task.notePh')}
              maxLength={300}
              multiline
              autoFocus
              style={{ minHeight: 88, textAlignVertical: 'top' }}
            />
            <Txt v="sub" color={p.muted} style={{ marginBottom: 14, marginLeft: 4 }}>
              {t(tool.mode === 'redo' ? 'parent.task.redoHint' : tool.mode === 'comment' ? 'parent.task.commentHint' : 'parent.task.noteHint')}
            </Txt>
            {tool.mode === 'note' ? <Btn small kind="secondary" icon="clipboard-outline" title={t('parent.task.paste')} onPress={pasteNote} style={{ alignSelf: 'flex-start', marginBottom: 14 }} /> : null}
            <Btn
              title={tool.mode === 'redo' ? t('parent.task.redoBtn') : tool.mode === 'comment' ? t('parent.task.send') : t('common.save')}
              kind={tool.mode === 'redo' ? 'bad' : 'primary'}
              loading={toolBusy}
              disabled={tool.mode !== 'redo' && tool.text.trim() === tool.initial.trim()}
              onPress={submitTool}
            />
          </>
        ) : null}
      </Sheet>
      <PhoneLimitGuide visible={guide} onClose={() => setGuide(false)} />
      <ChatSheet task={chat} readOnly={viewer} onClose={() => setChat(null)} onCount={setCount} />
      {toolOpen ? null : toast.node}
    </>
  );
}

// The server hands back fresh objects and rotated signed photo URLs on every poll: compare without them.
function overviewKey(ov: Overview, me: Me) {
  return JSON.stringify({
    ov: { ...ov, days: ov.days.map((d) => ({ ...d, tasks: d.tasks.map((tk) => ({ ...tk, photos: tk.photos.map((ph) => ph.id) })) })) },
    children: me.children,
    hard: me.family.hard_deadline,
    today: todayIn(me.family.tz),
  });
}

// The card itself belongs to TaskCards; long-press it (or use the links below) to comment or edit the assignment.
function TaskBlock({
  x,
  busy,
  act,
  open,
  tool,
  overdue,
  viewer,
  chat,
}: {
  x: Task;
  busy: boolean;
  act: (t: Task, a: ParentAction) => void;
  open: (url: string, caption: string, id: number) => void;
  tool: (t: Task, mode: ToolMode) => void;
  overdue?: boolean;
  viewer?: boolean;
  chat: (t: Task) => void;
}) {
  const p = usePalette();
  const t = useT();
  const link = (mode: 'comment' | 'note', icon: 'chatbubble-outline' | 'create-outline', value: string | null, label: string) => (
    <Pressable
      onPress={() => tool(x, mode)}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}: ${value}` : label}
      style={({ pressed }) => [styles.link, { backgroundColor: pressed ? p.fill : 'transparent' }]}
    >
      <Icon name={icon} size={15} color={value ? p.brand : p.ink2} />
      <Txt v="sub" color={value ? p.ink : p.ink2} numberOfLines={1} style={{ flexShrink: 1, fontWeight: '500' }}>
        {value ? `«${value}»` : label}
      </Txt>
    </Pressable>
  );
  // viewers read: status, notes, photos, voice and the chat; nothing to change
  if (viewer) return <ParentTaskCard t={x} busy={false} onAction={act} onOpen={open} overdue={overdue} readOnly onChat={chat} />;
  return (
    <View>
      {/* not accessible as a whole, so screen readers still reach the card's own buttons */}
      <Pressable accessible={false} onLongPress={() => tool(x, 'comment')} delayLongPress={400}>
        <ParentTaskCard t={x} busy={busy} onAction={act} onOpen={open} overdue={overdue} onChat={chat} />
      </Pressable>
      <View style={styles.tools} accessibilityLabel={t('parent.task.toolsA11y', { name: x.label })}>
        {link('comment', 'chatbubble-outline', null, t('parent.task.comment'))}
        {link('note', 'create-outline', null, t('parent.task.note'))}
      </View>
    </View>
  );
}

function History({
  days,
  openDay,
  setOpenDay,
  busy,
  act,
  open,
  tool,
  viewer,
  chat,
}: {
  viewer?: boolean;
  chat: (t: Task) => void;
  days: Day[];
  openDay: string | null;
  setOpenDay: (d: string | null) => void;
  busy: number | null;
  act: (t: Task, a: ParentAction) => void;
  open: (url: string, caption: string, id: number) => void;
  tool: (t: Task, mode: ToolMode) => void;
}) {
  const p = usePalette();
  const t = useT();
  if (!days.length) return <Empty icon="time-outline" title={t('parent.history.emptyTitle')} text={t('parent.history.emptyText')} />;
  return (
    <View style={{ marginTop: space.xs }}>
      {days.map((d) => {
        const color = !d.total ? p.muted : d.done === d.total ? (d.on_time ? p.okFill : p.warn) : p.bad;
        return (
          <View key={d.date} style={{ marginBottom: 10 }}>
            <Group>
              <Pressable onPress={() => setOpenDay(openDay === d.date ? null : d.date)}>
                <Row
                  title={longDate(d.date)}
                  subtitle={`${d.done}/${d.total}${d.last_done_hm ? t('parent.history.until', { hm: d.last_done_hm }) : ''}${d.on_time ? t('parent.history.onTime') : ''}`}
                  right={
                    <View style={[styles.dayMark, { borderColor: color, backgroundColor: d.total && d.done === d.total ? color : 'transparent' }]}>
                      {d.total && d.done === d.total ? <Icon name={d.on_time ? 'checkmark' : 'time'} size={12} color="#fff" /> : null}
                    </View>
                  }
                  chevron
                />
              </Pressable>
            </Group>
            {openDay === d.date ? (
              <View style={{ marginTop: 8 }}>
                {d.tasks.map((x) => (
                  <TaskBlock key={x.id} x={x} busy={busy === x.id} act={act} open={open} tool={tool} viewer={viewer} chat={chat} />
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
  headBtns: { flexDirection: 'row', gap: space.xs },
  seen: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -space.s, marginBottom: space.s, marginLeft: 2 },
  seenDot: { width: 8, height: 8, borderRadius: 4 },
  hero: { gap: space.s },
  heroTop: { flexDirection: 'row', alignItems: 'center' },
  streaks: { flexDirection: 'row', gap: space.s },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  attn: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  dayMark: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  tools: { flexDirection: 'row', gap: space.xxs, marginTop: -2, marginBottom: space.s, paddingHorizontal: space.xxs },
  link: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: space.xs, minHeight: 32, borderRadius: radius.s, flexShrink: 1, maxWidth: '55%' },
  // the "remind" action floats above the tab bar, on the thumb side
  fabWrap: { position: 'absolute', left: 0, right: 0, bottom: space.m, alignItems: 'flex-end' },
  fab: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 50, paddingHorizontal: 18, borderRadius: 25 },
});
