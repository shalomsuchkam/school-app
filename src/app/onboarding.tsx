import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeInRight, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { InviteSheet } from '@/components/InviteSheet';
import { Btn, Chip, Field, Group, IconBtn, Row, TimeStepper, ToggleRow, Txt, WeekdayPicker } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { toMin, WD_LONG, WD_SHORT } from '@/lib/format';
import { ITEM_PRESETS, SUBJECT_PRESETS } from '@/lib/presets';
import { usePalette } from '@/lib/theme';

type Subj = { name: string; emoji: string; light: boolean };
type Item = { title: string; emoji: string; needs_photo: boolean; required: boolean; on: boolean };

const STEPS = ['Знакомство', 'Учебные дни', 'Предметы', 'Расписание', 'Дела на завтра', 'Сроки'];

// The family lives in the parent's time zone: reminders and deadlines are computed there.
function deviceTz() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Almaty';
  } catch {
    return 'Asia/Almaty';
  }
}

export default function Onboarding() {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const [step, setStep] = useState(0);
  const [child, setChild] = useState('');
  const [parent, setParent] = useState('');
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [subjects, setSubjects] = useState<Subj[]>([]);
  const [custom, setCustom] = useState('');
  const [plan, setPlan] = useState<Record<number, string[]>>({});
  const [planDay, setPlanDay] = useState(1);
  const [items, setItems] = useState<Item[]>(ITEM_PRESETS.map((i, n) => ({ ...i, on: n < 2 })));
  const [newItem, setNewItem] = useState('');
  const [soft, setSoft] = useState('17:30');
  const [hard, setHard] = useState('22:00');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [done, setDone] = useState(false);

  const has = (n: string) => subjects.some((s) => s.name === n);
  const toggleSubject = (s: Subj) => setSubjects(has(s.name) ? subjects.filter((x) => x.name !== s.name) : [...subjects, s]);
  const dayPlan = plan[planDay] ?? [];
  // same rule as Settings: both deadlines on the same evening, the first one earlier
  const deadlinesOk = toMin(soft) < toMin(hard);
  const canNext = [child.trim().length > 0, days.length > 0, subjects.length > 0, true, true, deadlinesOk][step];

  // What a failed attempt already created, so «Создать» again resumes instead of making a second family.
  const made = useRef<{ family: boolean; subjects: Record<string, number>; items: Set<string> }>({ family: false, subjects: {}, items: new Set() });
  const finish = async () => {
    if (busy || !deadlinesOk) return;
    setBusy(true);
    setError(null);
    const m = made.current;
    try {
      const tz = deviceTz();
      if (!m.family) {
        await signIn(await api.createFamily(child.trim(), parent.trim(), tz));
        m.family = true;
      }
      // core settings first, so even an interrupted setup never runs on the defaults
      await api.updateFamily({ child_name: child.trim(), school_weekdays: days, soft_deadline: soft, hard_deadline: hard, tz });
      for (const s of subjects) if (!m.subjects[s.name]) m.subjects[s.name] = (await api.addSubject(s)).id;
      for (const d of days) {
        const list = (plan[d] ?? []).map((n) => m.subjects[n]).filter(Boolean);
        if (list.length) await api.setLessons(d, list);
      }
      let pos = 0;
      for (const it of items.filter((x) => x.on)) {
        const at = pos++;
        if (m.items.has(it.title)) continue;
        await api.addItem({ title: it.title, emoji: it.emoji, needs_photo: it.needs_photo, required: it.required, weekdays: null, pos: at });
        m.items.add(it.title);
      }
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const enterApp = () => {
    // drop welcome/onboarding from history: Back must not lead to «create a family» again
    if (router.canDismiss()) router.dismissAll();
    router.replace('/parent');
  };

  const next = () => {
    if (step === 3 && !plan[planDay]) setPlanDay(days[0] ?? 1);
    if (step < STEPS.length - 1) {
      if (step === 2) setPlanDay(days[0] ?? 1);
      setStep(step + 1);
    } else finish();
  };

  if (done) {
    return (
      <View style={[styles.doneWrap, { backgroundColor: p.bg, paddingTop: insets.top + 60, paddingBottom: insets.bottom + 20 }]}>
        <Animated.View entering={FadeIn.duration(400)} style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 64 }}>🎉</Text>
          <Txt v="largeTitle" style={{ textAlign: 'center', marginTop: 12 }}>
            Всё готово!
          </Txt>
          <Txt v="body" color={p.muted} style={{ textAlign: 'center', marginTop: 8 }}>
            Осталось подключить телефон {child.trim()}: дайте ему код приглашения.
          </Txt>
        </Animated.View>
        <View style={{ gap: 10 }}>
          <Btn title="Показать код для ученика" onPress={() => setInviteOpen(true)} />
          <Btn title="Перейти в приложение" kind="plain" onPress={enterApp} />
        </View>
        <InviteSheet role={inviteOpen ? 'child' : null} onClose={() => setInviteOpen(false)} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: p.bg }} behavior="padding">
      <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <IconBtn icon="←" label="Назад" onPress={() => (step ? setStep(step - 1) : router.back())} />
          <View style={[styles.progress, { backgroundColor: p.line }]}>
            <Animated.View layout={LinearTransition.springify().damping(20)} style={[styles.bar, { backgroundColor: p.brand, width: `${((step + 1) / STEPS.length) * 100}%` }]} />
          </View>
          <Txt v="sub" color={p.muted}>
            {step + 1}/{STEPS.length}
          </Txt>
        </View>
        <Txt v="caps" color={p.brand} style={{ marginTop: 18 }}>
          {STEPS[step].toUpperCase()}
        </Txt>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 6 }} keyboardShouldPersistTaps="handled">
        <Animated.View key={step} entering={FadeInRight.duration(260)}>
          {step === 0 ? (
            <>
              <Txt v="largeTitle">Кто будет учиться?</Txt>
              <Txt v="callout" color={p.muted} style={{ marginVertical: 10 }}>
                Имя увидит ребёнок в приложении, а вы — в напоминаниях.
              </Txt>
              <Field label="Имя ученика" value={child} onChangeText={setChild} placeholder="Например, Алия" maxLength={30} autoFocus />
              <Field label="Как вас подписать (необязательно)" value={parent} onChangeText={setParent} placeholder="Мама" maxLength={30} />
            </>
          ) : null}

          {step === 1 ? (
            <>
              <Txt v="largeTitle">В какие дни учёба?</Txt>
              <Txt v="callout" color={p.muted} style={{ marginVertical: 10 }}>
                Задания готовятся накануне каждого учебного дня. Каникулы и праздники отметите позже.
              </Txt>
              <WeekdayPicker value={days} onChange={setDays} />
            </>
          ) : null}

          {step === 2 ? (
            <>
              <Txt v="largeTitle">Какие предметы?</Txt>
              <Txt v="callout" color={p.muted} style={{ marginVertical: 10 }}>
                Выберите из списка или добавьте свой. Всё можно поменять потом.
              </Txt>
              <View style={styles.wrap}>
                {SUBJECT_PRESETS.map((s) => (
                  <Chip key={s.name} label={`${s.emoji} ${s.name}`} selected={has(s.name)} onPress={() => toggleSubject(s)} />
                ))}
                {subjects.filter((s) => !SUBJECT_PRESETS.some((x) => x.name === s.name)).map((s) => (
                  <Chip key={s.name} label={`${s.emoji} ${s.name}`} selected onPress={() => toggleSubject(s)} />
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Field value={custom} onChangeText={setCustom} placeholder="Свой предмет" maxLength={40} />
                </View>
                <Btn
                  title="Добавить"
                  kind="secondary"
                  disabled={!custom.trim() || has(custom.trim())}
                  onPress={() => {
                    setSubjects([...subjects, { name: custom.trim(), emoji: '📘', light: false }]);
                    setCustom('');
                  }}
                />
              </View>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <Txt v="largeTitle">Уроки по дням</Txt>
              <Txt v="callout" color={p.muted} style={{ marginVertical: 10 }}>
                Нажимайте предметы по порядку уроков. Можно пропустить и заполнить позже во вкладке «Расписание».
              </Txt>
              <View style={styles.wrap}>
                {days.map((d) => (
                  <Chip key={d} label={`${WD_SHORT[d - 1]}${plan[d]?.length ? ` · ${plan[d].length}` : ''}`} selected={d === planDay} onPress={() => setPlanDay(d)} />
                ))}
              </View>
              <Txt v="headline" style={{ marginTop: 18, marginBottom: 8 }}>
                {WD_LONG[planDay - 1]}
              </Txt>
              <Group>
                {dayPlan.length ? (
                  dayPlan.map((n, i) => {
                    const s = subjects.find((x) => x.name === n);
                    return (
                      <Row
                        key={`${n}-${i}`}
                        icon={s?.emoji}
                        title={`${i + 1}. ${n}`}
                        right={
                          <Pressable hitSlop={10} onPress={() => setPlan({ ...plan, [planDay]: dayPlan.filter((_, j) => j !== i) })}>
                            <Txt v="headline" color={p.muted}>
                              ✕
                            </Txt>
                          </Pressable>
                        }
                      />
                    );
                  })
                ) : (
                  <Row title="Пока нет уроков" subtitle="Нажмите предметы ниже" />
                )}
              </Group>
              <View style={[styles.wrap, { marginTop: 14 }]}>
                {subjects.map((s) => (
                  <Chip key={s.name} label={`＋ ${s.emoji} ${s.name}`} tone="muted" onPress={() => setPlan({ ...plan, [planDay]: [...dayPlan, s.name] })} />
                ))}
              </View>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <Txt v="largeTitle">Что подготовить к утру?</Txt>
              <Txt v="callout" color={p.muted} style={{ marginVertical: 10 }}>
                Пункты появляются в списке каждый учебный день. Для части можно требовать фото.
              </Txt>
              <Group>
                {items.map((it, i) => (
                  <ToggleRow
                    key={it.title}
                    icon={it.emoji}
                    title={it.title}
                    subtitle={it.needs_photo ? 'С фото' : 'Галочкой'}
                    value={it.on}
                    onChange={(v) => setItems(items.map((x, j) => (j === i ? { ...x, on: v } : x)))}
                  />
                ))}
              </Group>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Field value={newItem} onChangeText={setNewItem} placeholder="Свой пункт" maxLength={50} />
                </View>
                <Btn
                  title="Добавить"
                  kind="secondary"
                  disabled={!newItem.trim()}
                  onPress={() => {
                    setItems([...items, { title: newItem.trim(), emoji: '✅', needs_photo: false, required: true, on: true }]);
                    setNewItem('');
                  }}
                />
              </View>
            </>
          ) : null}

          {step === 5 ? (
            <>
              <Txt v="largeTitle">Когда всё должно быть готово?</Txt>
              <Txt v="callout" color={p.muted} style={{ marginVertical: 10 }}>
                Если к сроку не всё сделано — вы получите уведомление. Последний срок — финальная проверка вечером.
              </Txt>
              <Group>
                <Row icon="⏰" title="Срок" subtitle="Уведомление родителю" right={<TimeStepper value={soft} onChange={setSoft} clamp />} />
                <Row icon="🌙" title="Последний срок" subtitle="Финальная проверка" right={<TimeStepper value={hard} onChange={setHard} clamp />} />
              </Group>
              {!deadlinesOk ? (
                <Txt v="callout" color={p.warn} style={{ marginTop: 14 }}>
                  Срок должен быть раньше последнего срока — в тот же вечер.
                </Txt>
              ) : null}
              {error ? (
                <Txt v="callout" color={p.bad} style={{ marginTop: 14 }}>
                  {error}
                </Txt>
              ) : null}
            </>
          ) : null}
        </Animated.View>
      </ScrollView>

      <View style={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 16, paddingTop: 8 }}>
        <Btn title={step === STEPS.length - 1 ? 'Создать' : step === 3 && !Object.keys(plan).length ? 'Заполню позже' : 'Далее'} onPress={next} disabled={!canNext} loading={busy} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  progress: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  bar: { height: 6, borderRadius: 3 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  doneWrap: { flex: 1, paddingHorizontal: 24, justifyContent: 'space-between' },
});
