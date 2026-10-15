import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition, useReducedMotion } from 'react-native-reanimated';

import type { ParentAction, Task } from '@/lib/api';
import { t as tr, tn, useT } from '@/lib/i18n';
import { radius, usePalette } from '@/lib/theme';

import { Btn, Icon, type IconName, Txt } from './ui';

// Status at a glance: the colour of the left bar and the chip tells the story before any reading.
// todo = neutral, wait = waiting for the parent (amber), ok = done/accepted (green), bad = redo/declined/overdue (red).
type Tone = 'todo' | 'wait' | 'ok' | 'bad';
function statusFor(t: Task, viewer: 'child' | 'parent', overdue: boolean): [Tone, string] {
  switch (t.status) {
    case 'done':
      if (t.accepted) return ['ok', viewer === 'child' ? tr('child.st.acceptedChild') : tr('child.st.accepted')];
      if (!t.needs_photo) return ['ok', `${tr('child.st.checked')}${t.done_hm ? ` · ${t.done_hm}` : ''}`];
      return ['ok', `${tr('child.st.submitted')}${t.done_hm ? ` · ${t.done_hm}` : ''}${t.photos.length > 1 ? ` · ${tn('child.st.photos', t.photos.length)}` : ''}`];
    case 'skip_ok':
      return ['ok', tr('child.st.skipOk')];
    case 'skip_pending':
      return ['wait', viewer === 'child' ? tr('child.st.waiting') : `${tr('child.st.asksSkip')}${t.skip_reason ? `: ${t.skip_reason}` : ''}`];
    case 'skip_no':
      return ['bad', viewer === 'child' ? tr('child.st.skipNoChild') : tr('child.st.skipNo')];
    case 'redo':
      return ['bad', viewer === 'child' ? tr('child.st.redoChild') : tr('child.st.redo')];
    default:
      if (overdue && t.required) return ['bad', viewer === 'child' ? tr('child.st.overdueChild') : tr('child.st.overdue')];
      return ['todo', !t.required ? tr('child.st.optional') : t.needs_photo ? tr('child.st.needPhoto') : tr('child.st.markWhenDone')];
  }
}

function useTone(tone: Tone) {
  const p = usePalette();
  return {
    todo: { fg: p.muted, bg: p.fill, bar: p.line, mark: 'ellipse-outline' as IconName, word: tr('child.tone.todo') },
    wait: { fg: p.warn, bg: p.warnSoft, bar: p.warn, mark: 'hourglass-outline' as IconName, word: tr('child.tone.wait') },
    ok: { fg: p.ok, bg: p.okSoft, bar: p.ok, mark: 'checkmark-circle' as IconName, word: tr('child.tone.ok') },
    bad: { fg: p.bad, bg: p.badSoft, bar: p.bad, mark: 'alert-circle' as IconName, word: tr('child.tone.bad') },
  }[tone];
}

function Shell({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const p = usePalette();
  const reduce = useReducedMotion();
  const c = useTone(tone);
  return (
    <Animated.View
      entering={reduce ? undefined : FadeInDown.duration(220)}
      layout={reduce ? undefined : LinearTransition.springify().damping(20)}
      style={[styles.card, { backgroundColor: p.card, shadowColor: p.shadow }, tone !== 'todo' && { borderColor: c.bg, borderWidth: 1 }]}
    >
      <View style={[styles.accent, { backgroundColor: c.bar }]} />
      {children}
    </Animated.View>
  );
}

function Head({ t, tone, text, right }: { t: Task; tone: Tone; text: string; right?: React.ReactNode }) {
  const p = usePalette();
  const c = useTone(tone);
  return (
    <View style={styles.head}>
      {/* Label + status are read as one phrase by TalkBack; the tick button stays separately focusable. */}
      <View accessible accessibilityLabel={`${t.emoji} ${t.label}. ${c.word}: ${text}`} style={styles.headText}>
        <View style={[styles.emo, { backgroundColor: tone === 'todo' ? p.fill : c.bg }]}>
          <Text style={{ fontSize: 22 }}>{t.emoji}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt v="headline" numberOfLines={2} style={tone === 'ok' ? { color: p.ink2 } : undefined}>
            {t.label}
          </Txt>
          <View style={[styles.chip, { backgroundColor: c.bg }]}>
            <Icon name={c.mark} size={14} color={c.fg} style={{ marginTop: 2 }} />
            <Txt v="sub" color={c.fg} numberOfLines={2} style={{ flexShrink: 1 }}>
              {text}
            </Txt>
          </View>
        </View>
      </View>
      {right}
    </View>
  );
}

function Thumbs({ t, onOpen }: { t: Task; onOpen: (url: string, caption: string, id: number) => void }) {
  const p = usePalette();
  if (!t.photos.length) return null;
  return (
    <View style={styles.thumbs}>
      {t.photos.map((ph) =>
        ph.url ? (
          <Pressable key={ph.id} onPress={() => onOpen(ph.url!, `${t.label} · ${ph.hm ?? ''}`, ph.id)}>
            {/* Signed URLs rotate every refresh; the photo id keeps the cached image. No transition:
                the rotated URL counts as a new source, so a fade here replays as a flicker on each poll. */}
            <Image source={{ uri: ph.url, cacheKey: `photo-${ph.id}` }} style={[styles.thumb, { borderColor: p.line }]} contentFit="cover" transition={0} />
            {ph.hm ? (
              <View style={styles.time}>
                <Txt v="sub" color="#fff" style={{ fontSize: 11 }}>
                  {ph.hm}
                </Txt>
              </View>
            ) : null}
          </Pressable>
        ) : null,
      )}
    </View>
  );
}

// "What was assigned" (child-editable on lessons) and the parent's comment on the photos.
function Notes({ t, onNote }: { t: Task; onNote?: (t: Task) => void }) {
  const p = usePalette();
  const tt = useT();
  const note = t.note?.trim() || null;
  const comment = t.parent_comment?.trim() || null;
  const editable = !!onNote && t.kind === 'lesson';
  if (!note && !comment && !editable) return null;
  return (
    <View style={styles.notes}>
      {comment ? (
        <View accessible accessibilityLabel={`${tr('child.comment.label')}: ${comment}`} style={[styles.comment, { backgroundColor: p.warnSoft, borderColor: p.warn }]}>
          <Txt v="caps" color={p.ink2} style={{ textTransform: 'uppercase' }} numberOfLines={1}>
            💬 {tt('child.comment.label')}
          </Txt>
          <Txt v="callout" style={{ marginTop: 2 }}>
            {comment}
          </Txt>
        </View>
      ) : null}
      {note || editable ? (
        <Pressable
          disabled={!editable}
          onPress={() => onNote?.(t)}
          hitSlop={6}
          accessibilityRole={editable ? 'button' : undefined}
          accessibilityLabel={note ? `${tr('child.note.label')}: ${note}` : tr('child.note.add')}
          accessibilityHint={editable && note ? tr('child.note.edit') : undefined}
          style={({ pressed }) => [styles.note, { backgroundColor: note ? p.fill : 'transparent', borderColor: note ? 'transparent' : p.line, opacity: pressed ? 0.7 : 1 }]}
        >
          <Icon name={note ? 'document-text-outline' : 'create-outline'} size={16} color={note ? p.ink2 : p.muted} style={{ marginTop: 2 }} />
          <Txt v="callout" color={note ? p.ink : p.muted} numberOfLines={4} style={{ flex: 1 }}>
            {note ?? tt('child.note.add')}
          </Txt>
          {editable && note ? <Icon name="pencil" size={14} color={p.muted} style={{ marginTop: 3 }} /> : null}
        </Pressable>
      ) : null}
    </View>
  );
}

function Check({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  const p = usePalette();
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label} style={({ pressed }) => [styles.check, { borderColor: on ? p.ok : p.line, backgroundColor: on ? p.ok : 'transparent', transform: [{ scale: pressed ? 0.9 : 1 }] }]}>
      {on ? <Icon name="checkmark" size={20} color="#fff" /> : null}
    </Pressable>
  );
}

export function ChildTaskCard({
  t,
  onPhoto,
  onSkip,
  onCheck,
  onOpen,
  onNote,
  overdue = false,
  queued = 0,
}: {
  t: Task;
  onPhoto: (t: Task) => void;
  onSkip: (t: Task) => void;
  onCheck: (t: Task, done: boolean) => void;
  onOpen: (url: string, caption: string, id: number) => void;
  /** Opens the "what was assigned" editor (lessons only). */
  onNote?: (t: Task) => void;
  /** The deadline has passed: unfinished required items turn red. */
  overdue?: boolean;
  /** Photos of this task waiting in the offline queue. */
  queued?: number;
}) {
  const tt = useT();
  const [tone0, text0] = statusFor(t, 'child', overdue);
  // A photo saved offline counts as "on its way" until it actually reaches the server.
  const waiting = queued > 0 && t.status !== 'done' && t.status !== 'skip_ok';
  const tone: Tone = waiting ? 'wait' : tone0;
  const text = waiting ? `${tr('child.st.queued')}${queued > 1 ? ` · ${tn('child.st.photos', queued)}` : ''}` : text0;
  // Simple checklist item: one big tick, nothing else.
  if (!t.needs_photo) {
    const on = t.status === 'done' || t.status === 'skip_ok';
    return (
      <Shell tone={tone}>
        <Head t={t} tone={tone} text={text} right={t.status === 'skip_pending' ? null : <Check on={on} label={t.label} onPress={() => onCheck(t, !on)} />} />
        <Notes t={t} onNote={onNote} />
      </Shell>
    );
  }
  const open = !['skip_ok', 'skip_pending', 'done'].includes(t.status);
  const canSkip = ['todo', 'skip_no', 'redo'].includes(t.status) && t.photos.length === 0;
  const photoLabel = t.kind === 'lesson' ? tt('child.card.takePhoto') : tt('child.card.photo');
  return (
    <Shell tone={tone}>
      <Head t={t} tone={tone} text={text} />
      <Notes t={t} onNote={onNote} />
      <Thumbs t={t} onOpen={onOpen} />
      {t.status === 'done' && t.photos.length < 2 ? (
        <View style={styles.btns}>
          <Btn small kind="plain" icon="add" title={tt('child.card.morePage')} onPress={() => onPhoto(t)} />
        </View>
      ) : open ? (
        <View style={styles.btns}>
          {t.light && t.status === 'todo' ? (
            <>
              <Btn small kind="secondary" title={tt('child.card.noHw')} onPress={() => onSkip(t)} style={{ flex: 1 }} />
              <Btn small icon="camera" title={photoLabel} onPress={() => onPhoto(t)} style={{ flex: 1 }} />
            </>
          ) : (
            <>
              <Btn small icon="camera" title={photoLabel} onPress={() => onPhoto(t)} style={{ flex: 1 }} />
              {canSkip ? <Btn small kind="plain" title={t.kind === 'lesson' ? tt('child.card.noHw') : tt('child.card.notNeeded')} onPress={() => onSkip(t)} /> : null}
            </>
          )}
        </View>
      ) : null}
    </Shell>
  );
}

export function ParentTaskCard({
  t,
  busy,
  onAction,
  onOpen,
  overdue = false,
}: {
  t: Task;
  busy: boolean;
  onAction: (t: Task, a: ParentAction) => void;
  onOpen: (url: string, caption: string, id: number) => void;
  /** The deadline has passed: unfinished required items turn red. */
  overdue?: boolean;
}) {
  const tt = useT();
  const [tone, text] = statusFor(t, 'parent', overdue);
  const a = (x: ParentAction) => () => onAction(t, x);
  let actions: React.ReactNode = null;
  if (t.status === 'skip_pending') {
    actions = (
      <>
        <Btn small kind="ok" title={tt('child.card.approve')} onPress={a('skip_ok')} disabled={busy} style={{ flex: 1 }} />
        <Btn small kind="bad" title={tt('child.card.decline')} onPress={a('skip_no')} disabled={busy} style={{ flex: 1 }} />
      </>
    );
  } else if (t.status === 'done') {
    actions = (
      <>
        {!t.accepted && t.needs_photo ? <Btn small kind="ok" title={tt('child.card.accept')} onPress={a('ok')} disabled={busy} /> : null}
        {t.needs_photo ? <Btn small kind="plain" title={tt('child.card.redo')} onPress={a('redo')} disabled={busy} /> : null}
        <Btn small kind="plain" title={tt('child.card.undo')} onPress={a('reset')} disabled={busy} />
      </>
    );
  } else if (t.status === 'skip_ok' || t.status === 'skip_no' || t.status === 'redo') {
    actions = <Btn small kind="plain" title={tt('child.card.clearMark')} onPress={a('reset')} disabled={busy} />;
  } else if (t.required) {
    actions = <Btn small kind="plain" title={t.needs_photo ? tt('child.card.closeNoPhoto') : tt('child.card.mark')} onPress={a(t.needs_photo ? 'skip_ok' : 'done')} disabled={busy} />;
  }
  return (
    <Shell tone={tone}>
      <Head t={t} tone={tone} text={text} />
      <Notes t={t} />
      <Thumbs t={t} onOpen={onOpen} />
      {actions ? <View style={styles.btns}>{actions}</View> : null}
    </Shell>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.l, padding: 14, paddingLeft: 20, marginBottom: 10, overflow: 'hidden', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headText: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 },
  chip: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'flex-start', gap: 5, maxWidth: '100%', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, marginTop: 5 },
  emo: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  thumbs: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  thumb: { width: 96, height: 96, borderRadius: 14, borderWidth: 1 },
  time: { position: 'absolute', left: 6, bottom: 6, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  btns: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  notes: { gap: 8, marginTop: 10 },
  comment: { borderRadius: radius.m, borderLeftWidth: 3, paddingHorizontal: 12, paddingVertical: 8 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: radius.m, borderWidth: 1, borderStyle: 'dashed', paddingHorizontal: 12, paddingVertical: 8, minHeight: 40 },
  check: { width: 34, height: 34, borderRadius: 17, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
});
