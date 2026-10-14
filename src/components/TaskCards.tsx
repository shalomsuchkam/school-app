import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition, useReducedMotion } from 'react-native-reanimated';

import type { ParentAction, Task } from '@/lib/api';
import { radius, usePalette } from '@/lib/theme';

import { Btn, Txt } from './ui';

type Tone = 'ok' | 'warn' | 'bad' | undefined;
function statusFor(t: Task, viewer: 'child' | 'parent'): [Tone, string] {
  switch (t.status) {
    case 'done':
      if (t.accepted) return ['ok', viewer === 'child' ? 'Принято родителем' : 'Принято'];
      if (!t.needs_photo) return ['ok', `Отмечено${t.done_hm ? ` · ${t.done_hm}` : ''}`];
      return ['ok', `Сдано${t.done_hm ? ` · ${t.done_hm}` : ''}${t.photos.length > 1 ? ` · ${t.photos.length} фото` : ''}`];
    case 'skip_ok':
      return ['ok', 'Пропуск одобрен'];
    case 'skip_pending':
      return ['warn', viewer === 'child' ? 'Ждём ответ родителя' : `Просит пропустить${t.skip_reason ? `: ${t.skip_reason}` : ''}`];
    case 'skip_no':
      return ['bad', viewer === 'child' ? 'Не одобрено — нужно сделать' : 'Пропуск отклонён'];
    case 'redo':
      return ['bad', viewer === 'child' ? 'Нужно переснять' : 'Просили переснять'];
    default:
      return [undefined, !t.required ? 'По желанию' : t.needs_photo ? 'Нужно фото' : 'Отметь, когда готово'];
  }
}

function Shell({ t, tone, children }: { t: Task; tone: Tone; children: React.ReactNode }) {
  const p = usePalette();
  const reduce = useReducedMotion();
  const accent = tone === 'ok' ? p.ok : tone === 'warn' ? p.warn : tone === 'bad' ? p.bad : 'transparent';
  return (
    <Animated.View
      entering={reduce ? undefined : FadeInDown.duration(220)}
      layout={reduce ? undefined : LinearTransition.springify().damping(20)}
      style={[styles.card, { backgroundColor: p.card, shadowColor: p.shadow }]}
    >
      <View style={[styles.accent, { backgroundColor: accent }]} />
      {children}
    </Animated.View>
  );
}

function Head({ t, tone, text, right }: { t: Task; tone: Tone; text: string; right?: React.ReactNode }) {
  const p = usePalette();
  const color = tone === 'ok' ? p.ok : tone === 'warn' ? p.warn : tone === 'bad' ? p.bad : p.muted;
  return (
    <View style={styles.head}>
      <View style={[styles.emo, { backgroundColor: p.fill }]}>
        <Text style={{ fontSize: 22 }}>{t.emoji}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Txt v="headline" numberOfLines={2}>
          {t.label}
        </Txt>
        <Txt v="sub" color={color} style={{ marginTop: 2 }} numberOfLines={2}>
          {tone === 'ok' ? '✓ ' : tone === 'warn' ? '⏳ ' : tone === 'bad' ? '! ' : ''}
          {text}
        </Txt>
      </View>
      {right}
    </View>
  );
}

function Thumbs({ t, onOpen }: { t: Task; onOpen: (url: string, caption: string) => void }) {
  const p = usePalette();
  if (!t.photos.length) return null;
  return (
    <View style={styles.thumbs}>
      {t.photos.map((ph) =>
        ph.url ? (
          <Pressable key={ph.id} onPress={() => onOpen(ph.url!, `${t.label} · ${ph.hm ?? ''}`)}>
            <Image source={{ uri: ph.url }} style={[styles.thumb, { borderColor: p.line }]} contentFit="cover" transition={150} />
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

function Check({ on, onPress }: { on: boolean; onPress: () => void }) {
  const p = usePalette();
  return (
    <Pressable onPress={onPress} hitSlop={10} style={({ pressed }) => [styles.check, { borderColor: on ? p.ok : p.line, backgroundColor: on ? p.ok : 'transparent', transform: [{ scale: pressed ? 0.9 : 1 }] }]}>
      {on ? <Text style={{ color: '#fff', fontSize: 16, fontWeight: '900' }}>✓</Text> : null}
    </Pressable>
  );
}

export function ChildTaskCard({
  t,
  onPhoto,
  onSkip,
  onCheck,
  onOpen,
}: {
  t: Task;
  onPhoto: (t: Task) => void;
  onSkip: (t: Task) => void;
  onCheck: (t: Task, done: boolean) => void;
  onOpen: (url: string, caption: string) => void;
}) {
  const [tone, text] = statusFor(t, 'child');
  // Simple checklist item: one big tick, nothing else.
  if (!t.needs_photo) {
    const on = t.status === 'done' || t.status === 'skip_ok';
    return (
      <Shell t={t} tone={tone}>
        <Head t={t} tone={tone} text={text} right={t.status === 'skip_pending' ? null : <Check on={on} onPress={() => onCheck(t, !on)} />} />
      </Shell>
    );
  }
  const open = !['skip_ok', 'skip_pending', 'done'].includes(t.status);
  const canSkip = ['todo', 'skip_no', 'redo'].includes(t.status) && t.photos.length === 0;
  const photoLabel = t.kind === 'lesson' ? 'Сфотографировать' : 'Фото';
  return (
    <Shell t={t} tone={tone}>
      <Head t={t} tone={tone} text={text} />
      <Thumbs t={t} onOpen={onOpen} />
      {t.status === 'done' && t.photos.length < 2 ? (
        <View style={styles.btns}>
          <Btn small kind="plain" icon="＋" title="Ещё страница" onPress={() => onPhoto(t)} />
        </View>
      ) : open ? (
        <View style={styles.btns}>
          {t.light && t.status === 'todo' ? (
            <>
              <Btn small kind="secondary" title="Нет ДЗ" onPress={() => onSkip(t)} style={{ flex: 1 }} />
              <Btn small icon="📸" title={photoLabel} onPress={() => onPhoto(t)} style={{ flex: 1 }} />
            </>
          ) : (
            <>
              <Btn small icon="📸" title={photoLabel} onPress={() => onPhoto(t)} style={{ flex: 1 }} />
              {canSkip ? <Btn small kind="plain" title={t.kind === 'lesson' ? 'Нет ДЗ' : 'Не нужно'} onPress={() => onSkip(t)} /> : null}
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
}: {
  t: Task;
  busy: boolean;
  onAction: (t: Task, a: ParentAction) => void;
  onOpen: (url: string, caption: string) => void;
}) {
  const [tone, text] = statusFor(t, 'parent');
  const a = (x: ParentAction) => () => onAction(t, x);
  let actions: React.ReactNode = null;
  if (t.status === 'skip_pending') {
    actions = (
      <>
        <Btn small kind="ok" title="Одобрить" onPress={a('skip_ok')} disabled={busy} style={{ flex: 1 }} />
        <Btn small kind="bad" title="Отклонить" onPress={a('skip_no')} disabled={busy} style={{ flex: 1 }} />
      </>
    );
  } else if (t.status === 'done') {
    actions = (
      <>
        {!t.accepted && t.needs_photo ? <Btn small kind="ok" title="Принять" onPress={a('ok')} disabled={busy} /> : null}
        {t.needs_photo ? <Btn small kind="plain" title="Переснять" onPress={a('redo')} disabled={busy} /> : null}
        <Btn small kind="plain" title="Отменить" onPress={a('reset')} disabled={busy} />
      </>
    );
  } else if (t.status === 'skip_ok' || t.status === 'skip_no' || t.status === 'redo') {
    actions = <Btn small kind="plain" title="Отменить отметку" onPress={a('reset')} disabled={busy} />;
  } else if (t.required) {
    actions = <Btn small kind="plain" title={t.needs_photo ? 'Закрыть без фото' : 'Отметить'} onPress={a(t.needs_photo ? 'skip_ok' : 'done')} disabled={busy} />;
  }
  return (
    <Shell t={t} tone={tone}>
      <Head t={t} tone={tone} text={text} />
      <Thumbs t={t} onOpen={onOpen} />
      {actions ? <View style={styles.btns}>{actions}</View> : null}
    </Shell>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.l, padding: 14, paddingLeft: 16, marginBottom: 10, overflow: 'hidden', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  accent: { position: 'absolute', left: 0, top: 14, bottom: 14, width: 4, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emo: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  thumbs: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  thumb: { width: 96, height: 96, borderRadius: 14, borderWidth: 1 },
  time: { position: 'absolute', left: 6, bottom: 6, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  btns: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  check: { width: 34, height: 34, borderRadius: 17, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
});
