import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';

import { api, type Message, type Task } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { hairline, radius, space, type as typeScale, usePalette } from '@/lib/theme';

import { Badge, Empty, haptic, Icon, MAX_SCALE, PressableScale, Sheet, Skeleton, Txt } from './ui';

export const CHAT_MAX = 500;
const POLL_MS = 5000;

// A message typed on this phone that the server has not confirmed yet (or that failed to send).
type Pending = { key: string; body: string; state: 'sending' | 'failed'; at: string };

/** "18:05" in the phone's time (messages are about the evening that is happening now). */
export function hmLocal(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Per-task chat between the child and the parents. Polls every 5 s while open; a sent message shows at once
 * (optimistic) and turns into a "tap to retry" bubble when the server refuses it. Viewers read only.
 */
export function ChatSheet({ task, readOnly, onClose, onCount }: { task: Task | null; readOnly?: boolean; onClose: () => void; onCount?: (taskId: number, n: number) => void }) {
  const p = usePalette();
  const t = useT();
  const { height } = useWindowDimensions();
  const [shown, setShown] = useState<Task | null>(task);
  if (task && task !== shown && task.id !== shown?.id) setShown(task);
  const [list, setList] = useState<Message[] | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const taskId = task?.id ?? null;
  const reportCount = useEffectEvent((id: number, n: number) => onCount?.(id, n));

  useEffect(() => {
    if (taskId === null) return;
    let alive = true;
    const load = () =>
      api
        .messages(taskId)
        .then((m) => {
          if (!alive) return;
          setList(m);
          setError(null);
          reportCount(taskId, m.length);
        })
        .catch((e: Error) => alive && setError(e.message));
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
      setList(null);
      setPending([]);
      setError(null);
    };
  }, [taskId]);

  const keys = useRef(0);
  const send = async (body: string, retryKey?: string) => {
    if (taskId === null) return;
    const key = retryKey ?? `p${++keys.current}`;
    const at = new Date().toISOString();
    setPending((cur) => [...cur.filter((x) => x.key !== key), { key, body, state: 'sending', at }]);
    try {
      const m = await api.sendMessage(taskId, body);
      haptic.tap();
      setPending((cur) => cur.filter((x) => x.key !== key));
      setList((cur) => (cur ? (cur.some((x) => x.id === m.id) ? cur : [...cur, m]) : [m]));
      onCount?.(taskId, (list?.filter((x) => x.id !== m.id).length ?? 0) + 1);
    } catch (e) {
      haptic.warn();
      setPending((cur) => cur.map((x) => (x.key === key ? { ...x, state: 'failed' } : x)));
      setError((e as Error).message);
    }
  };
  const submit = () => {
    const body = text.trim();
    if (!body || body.length > CHAT_MAX) return;
    setText('');
    send(body);
  };

  const listH = Math.max(220, Math.min(460, height * 0.5));
  const items = list ?? [];
  return (
    <Sheet visible={!!task} title={shown ? `${shown.emoji} ${shown.label}` : t('common.chat.title')} onClose={onClose}>
      <ScrollView
        ref={scroll}
        style={[styles.list, { height: listH, backgroundColor: p.bg, borderColor: p.line }]}
        contentContainerStyle={{ padding: space.s, gap: space.xs, flexGrow: 1, justifyContent: items.length || pending.length ? 'flex-end' : 'center' }}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
        accessibilityLabel={t('common.chat.title')}
      >
        {list === null && !error ? (
          <View style={{ gap: space.xs }}>
            <Skeleton width="60%" height={44} r={radius.m} />
            <Skeleton width="45%" height={44} r={radius.m} style={{ alignSelf: 'flex-end' }} />
          </View>
        ) : !items.length && !pending.length ? (
          <Empty icon="chatbubbles-outline" title={t('common.chat.empty')} text={readOnly ? undefined : t('common.chat.emptyText')} />
        ) : null}
        {items.map((m) => (
          <Bubble key={m.id} mine={m.mine} who={m.mine ? null : m.name || t(m.role === 'child' ? 'common.chat.child' : 'common.chat.parent')} body={m.body} time={hmLocal(m.created_at)} />
        ))}
        {pending.map((x) => (
          <Bubble key={x.key} mine who={null} body={x.body} time={hmLocal(x.at)} state={x.state} onRetry={x.state === 'failed' ? () => send(x.body, x.key) : undefined} />
        ))}
      </ScrollView>
      {error && list !== null ? (
        <Txt v="sub" color={p.bad} style={{ marginTop: space.xs }} accessibilityLiveRegion="polite">
          {error}
        </Txt>
      ) : null}
      {error && list === null ? (
        <Txt v="callout" color={p.bad} style={{ marginTop: space.xs }}>
          {error}
        </Txt>
      ) : null}
      {readOnly ? (
        <View style={{ marginTop: space.s }}>
          <Badge icon="eye-outline" label={t('common.chat.readOnly')} />
        </View>
      ) : (
        <View style={[styles.composer, { borderColor: p.border, backgroundColor: p.card }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t('common.chat.ph')}
            placeholderTextColor={p.muted}
            accessibilityLabel={t('common.chat.ph')}
            maxLength={CHAT_MAX}
            multiline
            maxFontSizeMultiplier={MAX_SCALE.body}
            selectionColor={p.brand}
            cursorColor={p.brand}
            style={[typeScale.body, styles.input, { color: p.ink }]}
          />
          <PressableScale
            onPress={submit}
            disabled={!text.trim()}
            accessibilityRole="button"
            accessibilityLabel={t('common.chat.send')}
            accessibilityState={{ disabled: !text.trim() }}
            hitSlop={6}
            scaleTo={0.9}
            style={[styles.send, { backgroundColor: text.trim() ? p.brandFill : p.fill }]}
          >
            <Icon name="arrow-up" size={20} color={text.trim() ? '#fff' : p.muted} />
          </PressableScale>
        </View>
      )}
      {!readOnly && text.length > CHAT_MAX - 60 ? (
        <Txt v="sub" color={text.length >= CHAT_MAX ? p.bad : p.muted} style={{ alignSelf: 'flex-end', marginTop: 4, fontVariant: ['tabular-nums'] }}>
          {text.length}/{CHAT_MAX}
        </Txt>
      ) : null}
    </Sheet>
  );
}

function Bubble({ mine, who, body, time, state, onRetry }: { mine: boolean; who: string | null; body: string; time: string; state?: 'sending' | 'failed'; onRetry?: () => void }) {
  const p = usePalette();
  const t = useT();
  const failed = state === 'failed';
  const fg = mine && !failed ? '#fff' : p.ink;
  const inner = (
    <View
      style={[
        styles.bubble,
        mine ? styles.mine : styles.theirs,
        mine
          ? { backgroundColor: failed ? p.badSoft : p.brandFill, opacity: state === 'sending' ? 0.7 : 1 }
          : { backgroundColor: p.card, borderColor: p.line, borderWidth: hairline },
      ]}
    >
      {who ? (
        <Txt v="sub" color={p.brand} numberOfLines={1} style={{ fontWeight: '600' }}>
          {who}
        </Txt>
      ) : null}
      <Txt v="callout" color={fg} selectable>
        {body}
      </Txt>
      <View style={styles.meta}>
        {failed ? <Icon name="alert-circle" size={13} color={p.bad} /> : state === 'sending' ? <Icon name="time-outline" size={12} color={fg} /> : null}
        <Txt v="sub" color={failed ? p.bad : mine ? 'rgba(255,255,255,0.8)' : p.muted} style={{ fontSize: 11, lineHeight: 14 }}>
          {failed ? t('common.chat.failed') : state === 'sending' ? t('common.chat.sending') : time}
        </Txt>
      </View>
    </View>
  );
  if (!onRetry) return <View accessible accessibilityLabel={`${who ? `${who}: ` : ''}${body}, ${time}`}>{inner}</View>;
  return (
    <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel={`${body}. ${t('common.chat.failed')}`}>
      {inner}
    </Pressable>
  );
}

/** Chat icon with the message count, for task cards. */
export function ChatButton({ count, onPress, label }: { count: number; onPress: () => void; label: string }) {
  const p = usePalette();
  const t = useT();
  return (
    <PressableScale
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      hitSlop={8}
      scaleTo={0.9}
      accessibilityRole="button"
      accessibilityLabel={count ? t('common.chat.openN', { name: label, n: count }) : t('common.chat.open', { name: label })}
      style={[styles.chatBtn, { backgroundColor: count ? p.brandSoft : p.fill }]}
    >
      <Icon name={count ? 'chatbubbles' : 'chatbubbles-outline'} size={19} color={count ? p.brand : p.ink2} />
      {count ? (
        <View style={[styles.count, { backgroundColor: p.brandFill, borderColor: p.card }]}>
          <Txt v="sub" color="#fff" maxFontSizeMultiplier={1.2} style={{ fontSize: 11, lineHeight: 14, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
            {count > 99 ? '99+' : count}
          </Txt>
        </View>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  list: { borderRadius: radius.m, borderWidth: hairline, flexGrow: 0 },
  bubble: { maxWidth: '82%', borderRadius: radius.m, paddingHorizontal: space.s, paddingVertical: space.xs, gap: 2 },
  mine: { alignSelf: 'flex-end', borderBottomRightRadius: radius.xs },
  theirs: { alignSelf: 'flex-start', borderBottomLeftRadius: radius.xs },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: space.xs, marginTop: space.s, borderWidth: 1, borderRadius: radius.m, paddingLeft: space.s, paddingRight: 6, paddingVertical: 6 },
  input: { flex: 1, minHeight: 36, maxHeight: 120, paddingVertical: 7 },
  send: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  chatBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  count: { position: 'absolute', top: -4, right: -6, minWidth: 20, height: 20, borderRadius: 10, borderWidth: 2, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
});
