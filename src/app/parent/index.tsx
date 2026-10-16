import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';

import { Paywall } from '@/components/Paywall';
import { PhoneLimitGuide } from '@/components/PhoneLimitGuide';
import { PhotoViewer } from '@/components/PhotoViewer';
import { ParentTaskCard } from '@/components/TaskCards';
import { Btn, Chip, Empty, Field, Group, Icon, IconBtn, Loading, Row, Screen, SectionLabel, Sheet, Txt, useToast } from '@/components/ui';
import { api, ApiError, isDone, isPaywall, type Child, type Day, type Overview, type ParentAction, type Task } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ChildSwitcher, currentChildReady, getCurrentChild, setCurrentChild, useCurrentChild } from '@/lib/currentChild';
import { longDate, toMin } from '@/lib/format';
import { tn, useT } from '@/lib/i18n';
import { gradients, radius, usePalette } from '@/lib/theme';

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
  const [viewer, setViewer] = useState<{ url: string; caption: string; id: number } | null>(null);
  const [paywall, setPaywall] = useState(false);
  const [hard, setHard] = useState<string | null>(null);
  const [today, setToday] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool | null>(null);
  // the sheet keeps its last content while it slides away
  const [toolOpen, setToolOpen] = useState(false);
  const [toolBusy, setToolBusy] = useState(false);
  const [guide, setGuide] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const cid = await currentChildReady();
      const [ov, me] = await Promise.all([api.overview(cid ?? undefined), api.me()]);
      // the parent switched to another child meanwhile: that request's answer wins
      if (getCurrentChild() !== cid) return;
      setData(ov);
      setKids(me.children);
      setHard(me.family.hard_deadline);
      setToday(todayIn(me.family.tz));
      setError(null);
      setPaywall(false);
    } catch (e) {
      if (isPaywall(e)) return setPaywall(true);
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
  const open = (url: string, caption: string, id: number) => setViewer({ url, caption, id });
  const switchChild = (id: number | null) => {
    if (id === null || id === data.child_id) return;
    setCurrentChild(id);
    setOpenDay(null);
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
  const toolTitle = !tool ? '' : tool.mode === 'redo' ? t('parent.task.redoTitle') : tool.mode === 'comment' ? t('parent.task.comment') : t('parent.task.note');

  return (
    <>
      <Screen
        title={kids.find((c) => c.id === data.child_id)?.name || data.child_name || t('parent.tab.today')}
        subtitle={t('parent.today.subtitle', { date: longDate(active.date) })}
        onRefresh={load}
        right={<IconBtn icon="stats-chart-outline" label={t('parent.today.report')} onPress={() => router.push('/parent/report')} />}
      >
        <ChildSwitcher list={kids} value={childId} onChange={switchChild} />
        <View style={styles.seg}>
          <Chip label={t('parent.today.segDay')} selected={mode === 'day'} onPress={() => setMode('day')} />
          <Chip label={t('parent.today.segHistory')} selected={mode === 'history'} onPress={() => setMode('history')} />
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
                {!active.total ? t('parent.today.none') : left ? t('parent.today.left', { n: left }) : t('parent.today.ready')}
                {active.last_done_hm ? t('parent.today.lastAt', { hm: active.last_done_hm }) : ''}
              </Txt>
              <View style={[styles.track, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                <View style={[styles.fill, { width: `${active.total ? (active.done / active.total) * 100 : 0}%` }]} />
              </View>
            </LinearGradient>

            {overdue ? (
              <View style={[styles.overdue, { backgroundColor: p.badSoft, borderColor: p.bad }]} accessibilityRole="alert">
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <Icon name="phone-portrait-outline" size={22} color={p.bad} />
                  <Txt v="headline" color={p.bad} style={{ flex: 1 }}>
                    {t('parent.today.overdueTitle')}
                  </Txt>
                </View>
                <Txt v="callout" style={{ marginTop: 4 }}>
                  {tn('parent.today.overdueText', unfinished, { hm: hard ?? '' })}
                </Txt>
                <Btn title={t('parent.today.overdueBtn')} kind="bad" small icon="lock-closed-outline" onPress={() => setGuide(true)} style={{ marginTop: 10, alignSelf: 'flex-start' }} />
              </View>
            ) : null}

            {pending.length || toReview.length ? (
              <View style={[styles.attn, { backgroundColor: p.warnSoft }]}>
                <Txt v="callout" style={{ flex: 1 }}>
                  {pending.length ? t('parent.today.pending', { n: pending.length }) : ''}
                  {pending.length && toReview.length ? '   ' : ''}
                  {toReview.length ? t('parent.today.newPhotos', { n: toReview.length }) : ''}
                </Txt>
              </View>
            ) : null}

            {!active.total ? (
              <Empty icon="🗓️" title={t('parent.today.emptyTitle')} text={t('parent.today.emptyText')}>
                <Btn title={t('parent.today.openSchedule')} kind="secondary" onPress={() => router.push('/parent/schedule')} style={{ marginTop: 16 }} />
              </Empty>
            ) : (
              <>
                {left ? <Btn title={t('parent.today.nudge')} icon="🔔" kind="secondary" onPress={nudge} style={{ marginTop: 12 }} /> : null}
                {[...pending, ...active.tasks.filter((x) => x.status !== 'skip_pending')]
                  .reduce<{ k: string; items: Task[] }[]>((acc, task) => {
                    const k = task.kind === 'lesson' ? t('parent.today.groupLessons') : t('parent.today.groupPrep');
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
                        <TaskBlock key={x.id} x={x} busy={busy === x.id} act={act} open={open} tool={openTool} overdue={overdue} />
                      ))}
                    </View>
                  ))}
              </>
            )}
            <Btn title={t('parent.today.report')} icon="📊" kind="secondary" onPress={() => router.push('/parent/report')} style={{ marginTop: 16 }} />
          </>
        ) : (
          <History days={history} openDay={openDay} setOpenDay={setOpenDay} busy={busy} act={act} open={open} tool={openTool} />
        )}
      </Screen>
      <PhotoViewer url={viewer?.url ?? null} id={viewer?.id} caption={viewer?.caption} onClose={() => setViewer(null)} />
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
      {toolOpen ? null : toast.node}
    </>
  );
}

// The card itself belongs to TaskCards; long-press it (or use the links below) to comment or edit the assignment.
function TaskBlock({
  x,
  busy,
  act,
  open,
  tool,
  overdue,
}: {
  x: Task;
  busy: boolean;
  act: (t: Task, a: ParentAction) => void;
  open: (url: string, caption: string, id: number) => void;
  tool: (t: Task, mode: ToolMode) => void;
  overdue?: boolean;
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
      <Icon name={icon} size={15} color={value ? p.brand : p.muted} />
      <Txt v="sub" color={value ? p.ink : p.muted} numberOfLines={1} style={{ flexShrink: 1 }}>
        {value ? `«${value}»` : label}
      </Txt>
    </Pressable>
  );
  return (
    <View>
      {/* not accessible as a whole, so screen readers still reach the card's own buttons */}
      <Pressable accessible={false} onLongPress={() => tool(x, 'comment')} delayLongPress={400}>
        <ParentTaskCard t={x} busy={busy} onAction={act} onOpen={open} overdue={overdue} />
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
}: {
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
  if (!days.length) return <Empty icon="📅" title={t('parent.history.emptyTitle')} text={t('parent.history.emptyText')} />;
  return (
    <View style={{ marginTop: 12 }}>
      {days.map((d) => {
        const color = !d.total ? p.muted : d.done === d.total ? (d.on_time ? p.ok : p.warn) : p.bad;
        return (
          <View key={d.date} style={{ marginBottom: 10 }}>
            <Group>
              <Pressable onPress={() => setOpenDay(openDay === d.date ? null : d.date)}>
                <Row
                  title={longDate(d.date)}
                  subtitle={`${d.done}/${d.total}${d.last_done_hm ? t('parent.history.until', { hm: d.last_done_hm }) : ''}${d.on_time ? t('parent.history.onTime') : ''}`}
                  right={<View style={[styles.dot, { backgroundColor: color }]} />}
                  chevron
                />
              </Pressable>
            </Group>
            {openDay === d.date ? (
              <View style={{ marginTop: 8 }}>
                {d.tasks.map((x) => (
                  <TaskBlock key={x.id} x={x} busy={busy === x.id} act={act} open={open} tool={tool} />
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
  overdue: { borderRadius: radius.l, padding: 14, marginTop: 10, borderWidth: 1 },
  tools: { flexDirection: 'row', gap: 6, marginTop: -6, marginBottom: 10, paddingHorizontal: 4 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, flexShrink: 1, maxWidth: '55%' },
});
