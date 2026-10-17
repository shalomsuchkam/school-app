import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition, useReducedMotion } from 'react-native-reanimated';

import type { ParentAction, Task } from '@/lib/api';
import { t as tr, tn, useT } from '@/lib/i18n';
import { radius, space, usePalette } from '@/lib/theme';

import { ChatButton } from './ChatSheet';
import { Badge, Btn, Icon, type IconName, PressableScale, Txt } from './ui';
import { canRecordVoice, VoicePlayer } from './VoiceNote';

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
    todo: { fg: p.muted, bg: p.fill, badge: 'neutral' as const, mark: null, word: tr('child.tone.todo') },
    wait: { fg: p.warn, bg: p.warnSoft, badge: 'warn' as const, mark: 'hourglass' as IconName, word: tr('child.tone.wait') },
    ok: { fg: p.okFill, bg: p.okSoft, badge: 'ok' as const, mark: 'checkmark' as IconName, word: tr('child.tone.ok') },
    bad: { fg: p.badFill, bg: p.badSoft, badge: 'bad' as const, mark: 'alert' as IconName, word: tr('child.tone.bad') },
  }[tone];
}

// A page on the paper. Problems get a red-pen edge; finished work quietly steps back.
function Shell({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const p = usePalette();
  const reduce = useReducedMotion();
  return (
    <Animated.View
      entering={reduce ? undefined : FadeInDown.duration(220)}
      layout={reduce ? undefined : LinearTransition.springify().damping(20)}
      style={[styles.card, { backgroundColor: p.card, borderColor: tone === 'bad' ? p.bad : p.line, borderWidth: tone === 'bad' ? 1 : StyleSheet.hairlineWidth }]}
    >
      {children}
    </Animated.View>
  );
}

// Home chores carry a house and the parent's time estimate ("~20 мин") under the title.
function Meta({ t }: { t: Task }) {
  const p = usePalette();
  if (t.category !== 'home') return null;
  return (
    <View style={styles.meta}>
      <Icon name="home-outline" size={14} color={p.ink2} />
      <Txt v="sub" color={p.ink2} numberOfLines={1} style={{ fontWeight: '500' }}>
        {t.duration_min ? `${tr('child.home.tag')} · ${tr('child.home.min', { n: t.duration_min })}` : tr('child.home.tag')}
      </Txt>
    </View>
  );
}
const metaA11y = (t: Task) => (t.category === 'home' ? `, ${tr('child.home.tag')}${t.duration_min ? `, ${tr('child.home.min', { n: t.duration_min })}` : ''}` : '');

function Head({ t, tone, text, right, onChat }: { t: Task; tone: Tone; text: string; right?: React.ReactNode; onChat?: (t: Task) => void }) {
  const p = usePalette();
  const c = useTone(tone);
  return (
    <View style={styles.head}>
      {/* Label + status are read as one phrase by TalkBack; the tick button stays separately focusable. */}
      <View accessible accessibilityLabel={`${t.emoji} ${t.label}${metaA11y(t)}. ${c.word}: ${text}`} style={styles.headText}>
        <View style={[styles.emo, { backgroundColor: tone === 'todo' ? p.fill : c.bg }]}>
          <Text style={{ fontSize: 22 }}>{t.emoji}</Text>
          {/* state at a glance, even before reading: a small seal on the subject tile */}
          {c.mark ? (
            <View style={[styles.seal, { backgroundColor: c.fg, borderColor: p.card }]}>
              <Icon name={c.mark} size={11} color="#fff" />
            </View>
          ) : null}
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Txt v="headline" numberOfLines={2} color={tone === 'ok' ? p.ink2 : p.ink}>
            {t.label}
          </Txt>
          <Meta t={t} />
          <Badge label={text} tone={c.badge} />
        </View>
      </View>
      {onChat ? <ChatButton count={t.messages ?? 0} label={t.label} onPress={() => onChat(t)} /> : null}
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
          <Pressable
            key={ph.id}
            onPress={() => onOpen(ph.url!, `${t.label} · ${ph.hm ?? ''}`, ph.id)}
            accessibilityRole="imagebutton"
            accessibilityLabel={tr('child.photo.openA11y', { caption: ph.hm ? `${t.label}, ${ph.hm}` : t.label })}
          >
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="chatbubble-ellipses" size={14} color={p.warn} />
            <Txt v="sub" color={p.warn} style={{ fontWeight: '600' }} numberOfLines={1}>
              {tt('child.comment.label')}
            </Txt>
          </View>
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

// Big round tick: an obvious, thumb-sized target with a clear filled / empty state.
function Check({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  const p = usePalette();
  return (
    <PressableScale
      onPress={onPress}
      hitSlop={10}
      scaleTo={0.88}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      style={[styles.check, { borderColor: on ? p.okFill : p.border, backgroundColor: on ? p.okFill : 'transparent' }]}
    >
      {on ? <Icon name="checkmark" size={22} color="#fff" /> : null}
    </PressableScale>
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
  onChat,
  onVoice,
}: {
  t: Task;
  /** Opens the task's chat with the parents (icon with the message count). */
  onChat?: (t: Task) => void;
  /** Opens the voice-note recorder. */
  onVoice?: (t: Task) => void;
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
        <Head t={t} tone={tone} text={text} onChat={onChat} right={t.status === 'skip_pending' ? null : <Check on={on} label={t.label} onPress={() => onCheck(t, !on)} />} />
        <Notes t={t} onNote={onNote} />
        {t.voice_url ? <VoicePlayer url={t.voice_url} /> : null}
      </Shell>
    );
  }
  const open = !['skip_ok', 'skip_pending', 'done'].includes(t.status);
  const canSkip = ['todo', 'skip_no', 'redo'].includes(t.status) && t.photos.length === 0;
  const photoLabel = t.kind === 'lesson' ? tt('child.card.takePhoto') : tt('child.card.photo');
  // a voice note explains a lesson's homework ("we were told to learn the poem"): offered on lessons
  const voiceBtn =
    onVoice && canRecordVoice && t.kind === 'lesson' ? (
      <Btn small kind="plain" icon="mic-outline" title={t.voice_url ? tt('child.voice.redo') : tt('child.voice.record')} onPress={() => onVoice(t)} />
    ) : null;
  return (
    <Shell tone={tone}>
      <Head t={t} tone={tone} text={text} onChat={onChat} />
      <Notes t={t} onNote={onNote} />
      <Thumbs t={t} onOpen={onOpen} />
      {t.voice_url ? <VoicePlayer url={t.voice_url} /> : null}
      {t.status === 'done' && t.photos.length < 2 ? (
        <View style={styles.btns}>
          <Btn small kind="plain" icon="add" title={tt('child.card.morePage')} onPress={() => onPhoto(t)} />
          {voiceBtn}
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
          {voiceBtn}
        </View>
      ) : voiceBtn ? (
        <View style={styles.btns}>{voiceBtn}</View>
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
  readOnly = false,
  onChat,
}: {
  t: Task;
  /** A viewer (tutor / teacher): status, notes, photos and voice only; no actions. */
  readOnly?: boolean;
  onChat?: (t: Task) => void;
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
  if (readOnly) {
    actions = null;
  } else if (t.status === 'skip_pending') {
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
      <Head t={t} tone={tone} text={text} onChat={onChat} />
      <Notes t={t} />
      <Thumbs t={t} onOpen={onOpen} />
      {t.voice_url ? <VoicePlayer url={t.voice_url} /> : null}
      {actions ? <View style={styles.btns}>{actions}</View> : null}
    </Shell>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.l, padding: 14, marginBottom: space.xs, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  headText: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.s, minWidth: 0 },
  emo: { width: 46, height: 46, borderRadius: radius.m, alignItems: 'center', justifyContent: 'center' },
  seal: { position: 'absolute', right: -4, bottom: -4, width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  thumbs: { flexDirection: 'row', gap: space.xs, marginTop: space.s, flexWrap: 'wrap' },
  thumb: { width: 96, height: 96, borderRadius: radius.m, borderWidth: StyleSheet.hairlineWidth },
  time: { position: 'absolute', left: 6, bottom: 6, backgroundColor: 'rgba(20,18,14,0.62)', borderRadius: radius.xs, paddingHorizontal: 6, paddingVertical: 1 },
  btns: { flexDirection: 'row', gap: space.xs, marginTop: space.s, flexWrap: 'wrap' },
  notes: { gap: space.xs, marginTop: space.s },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  comment: { borderRadius: radius.s, borderLeftWidth: 3, paddingHorizontal: space.s, paddingVertical: space.xs },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs, borderRadius: radius.s, borderWidth: 1, borderStyle: 'dashed', paddingHorizontal: space.s, paddingVertical: space.xs, minHeight: 40 },
  check: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
