import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeInRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { InviteSheet } from '@/components/InviteSheet';
import { Btn, Chip, Field, Group, haptic, Icon, IconBtn, NotebookRule, Row, Segmented, TimeStepper, ToggleRow, Txt, WeekdayPicker } from '@/components/ui';
import { api, legalUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { toMin, wdLong, wdShort } from '@/lib/format';
import { getLang, LANGS, setLang, tn, useLang, useT } from '@/lib/i18n';
import { GRADES, gradeTemplate, itemPresets, subjectPresets, type Grade } from '@/lib/presets';
import { radius, usePalette } from '@/lib/theme';

type Subj = { name: string; emoji: string; light: boolean };
// preset: index into itemPresets(), so a preset's title follows a language switch made on step 0
type Item = { title: string; emoji: string; needs_photo: boolean; required: boolean; on: boolean; preset?: number };

const STEPS = ['intro', 'days', 'subjects', 'schedule', 'items', 'deadlines'];

// Where the family studies: sets the store price region later and the default calendar.
// Labels: 'onboarding.country.<code>'.
const COUNTRIES = [
  { code: 'KZ', flag: '🇰🇿' },
  { code: 'RU', flag: '🇷🇺' },
  { code: 'UZ', flag: '🇺🇿' },
  { code: 'KG', flag: '🇰🇬' },
  { code: 'TJ', flag: '🇹🇯' },
  { code: 'BY', flag: '🇧🇾' },
  { code: 'AZ', flag: '🇦🇿' },
  { code: 'GE', flag: '🇬🇪' },
  { code: 'AM', flag: '🇦🇲' },
  { code: 'TR', flag: '🇹🇷' },
  { code: 'AE', flag: '🇦🇪' },
  { code: 'DE', flag: '🇩🇪' },
  { code: 'GB', flag: '🇬🇧' },
  { code: 'US', flag: '🇺🇸' },
  { code: 'ZZ', flag: '🌍' },
];
function deviceCountry() {
  try {
    const region = new Intl.Locale(Intl.DateTimeFormat().resolvedOptions().locale).maximize().region ?? '';
    return COUNTRIES.some((c) => c.code === region) ? region : 'KZ';
  } catch {
    return 'KZ';
  }
}

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
  const t = useT();
  const lang = useLang();
  const { signIn } = useAuth();
  const [step, setStep] = useState(0);
  const [child, setChild] = useState('');
  const [parent, setParent] = useState('');
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [subjects, setSubjects] = useState<Subj[]>([]);
  const [custom, setCustom] = useState('');
  const [plan, setPlan] = useState<Record<number, string[]>>({});
  const [planDay, setPlanDay] = useState(1);
  const [items, setItems] = useState<Item[]>(() => itemPresets().map((i, n) => ({ ...i, preset: n, on: n < 2 })));
  const [newItem, setNewItem] = useState('');
  const [soft, setSoft] = useState('17:30');
  const [hard, setHard] = useState('22:00');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [country, setCountry] = useState(deviceCountry);
  const [consent, setConsent] = useState(false);
  // Quick start: the grade template last applied, and whether «skip to the last step» was used (Back returns to subjects).
  const [tpl, setTpl] = useState<Grade | null>(null);
  const [jumped, setJumped] = useState(false);

  const presets = subjectPresets();
  const presetItems = itemPresets();
  const titleOf = (it: Item) => (it.preset === undefined ? it.title : presetItems[it.preset].title);
  const has = (n: string) => subjects.some((s) => s.name === n);
  const toggleSubject = (s: Subj) => {
    if (!has(s.name)) return setSubjects([...subjects, s]);
    setSubjects(subjects.filter((x) => x.name !== s.name));
    // a removed subject also leaves the timetable
    setPlan(Object.fromEntries(Object.entries(plan).map(([d, list]) => [d, list.filter((n) => n !== s.name)])));
  };
  // Replaces subjects and the Mon–Fri timetable with the grade template for the chosen country; everything stays editable.
  const applyTemplate = (g: Grade) => {
    const tp = gradeTemplate(country, g);
    // keep subjects the parent added by hand
    const own = subjects.filter((s) => !presets.some((x) => x.name === s.name));
    setSubjects([...tp.subjects, ...own]);
    setPlan(tp.plan);
    setPlanDay(days[0] ?? 1);
    setTpl(g);
  };
  const skipToEnd = () => {
    setJumped(true);
    setStep(STEPS.length - 1);
  };
  const back = () => {
    if (!step) return router.back();
    if (jumped && step === STEPS.length - 1) {
      setJumped(false);
      return setStep(2);
    }
    setStep(step - 1);
  };
  const dayPlan = plan[planDay] ?? [];
  // same rule as Settings: both deadlines on the same evening, the first one earlier
  const deadlinesOk = toMin(soft) < toMin(hard);
  const canNext = [child.trim().length > 0, days.length > 0, subjects.length > 0, true, true, deadlinesOk && consent][step];

  // What a failed attempt already created, so «Создать» again resumes instead of making a second family.
  const made = useRef<{ family: boolean; subjects: Record<string, number>; items: Set<string> }>({ family: false, subjects: {}, items: new Set() });
  const finish = async () => {
    if (busy || !deadlinesOk || !consent) return;
    setBusy(true);
    setError(null);
    const m = made.current;
    try {
      const tz = deviceTz();
      if (!m.family) {
        await signIn(await api.createFamily({ child_name: child.trim(), parent_name: parent.trim(), tz, country, lang: getLang(), consent: true }));
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
        const title = titleOf(it);
        if (m.items.has(title)) continue;
        await api.addItem({ title, emoji: it.emoji, needs_photo: it.needs_photo, required: it.required, weekdays: null, pos: at });
        m.items.add(title);
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
      <View style={[styles.doneWrap, { backgroundColor: p.bg, paddingTop: insets.top + 72, paddingBottom: insets.bottom + 20 }]}>
        <NotebookRule height={insets.top + 220} step={30} marginX={20} />
        <Animated.View entering={FadeIn.duration(400)} style={styles.column}>
          <View style={[styles.doneSeal, { backgroundColor: p.okFill }]}>
            <Icon name="checkmark" size={40} color="#fff" />
          </View>
          <Txt v="largeTitle" accessibilityRole="header" style={{ marginTop: 20 }}>
            {t('onboarding.done.title')}
          </Txt>
          <Txt v="body" color={p.ink2} style={{ marginTop: 8, fontSize: 18, lineHeight: 25 }}>
            {t('onboarding.done.text', { name: child.trim() })}
          </Txt>
        </Animated.View>
        <View style={[styles.column, { gap: 10 }]}>
          <Btn title={t('onboarding.done.showCode')} icon="key-outline" onPress={() => setInviteOpen(true)} />
          <Btn title={t('onboarding.done.enter')} kind="ghost" onPress={enterApp} />
        </View>
        <InviteSheet role={inviteOpen ? 'child' : null} onClose={() => setInviteOpen(false)} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: p.bg }} behavior="padding">
      <View style={[styles.column, { paddingHorizontal: 20, paddingTop: insets.top + 10 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <IconBtn icon="←" label={t('common.back')} onPress={back} />
          {/* one segment per step: where you are and how much is left, at a glance */}
          <View style={styles.progress} accessible accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: STEPS.length, now: step + 1 }}>
            {STEPS.map((k, i) => (
              <View key={k} style={[styles.bar, { backgroundColor: i <= step ? p.brand : p.line }]} />
            ))}
          </View>
          <Txt v="sub" color={p.muted} style={{ fontVariant: ['tabular-nums'], fontWeight: '600' }}>
            {step + 1}/{STEPS.length}
          </Txt>
        </View>
        <Txt v="sub" color={p.brand} style={{ marginTop: 20, fontWeight: '600' }}>
          {t(`onboarding.step.${STEPS[step]}`)}
        </Txt>
      </View>

      <ScrollView contentContainerStyle={[styles.column, { padding: 20, paddingTop: 6 }]} keyboardShouldPersistTaps="handled">
        <Animated.View key={step} entering={FadeInRight.duration(260)}>
          {step === 0 ? (
            <>
              <Txt v="largeTitle">{t('onboarding.intro.title')}</Txt>
              <Txt v="callout" color={p.muted} style={{ marginVertical: 10 }}>
                {t('onboarding.intro.text')}
              </Txt>
              <Txt v="sub" color={p.ink2} style={{ marginBottom: 6, marginLeft: 2, fontWeight: '600' }}>
                {t('common.language')}
              </Txt>
              <Segmented value={lang} onChange={setLang} options={LANGS.map((l) => ({ value: l.code, label: l.label }))} style={{ marginBottom: 16 }} />
              <Field label={t('onboarding.intro.child')} value={child} onChangeText={setChild} placeholder={t('onboarding.intro.childPh')} maxLength={30} autoFocus />
              <Field label={t('onboarding.intro.parent')} value={parent} onChangeText={setParent} placeholder={t('onboarding.intro.parentPh')} maxLength={30} />
              <Txt v="sub" color={p.ink2} style={{ marginTop: 6, marginBottom: 6, marginLeft: 2, fontWeight: '600' }}>
                {t('common.country')}
              </Txt>
              <View style={styles.wrap}>
                {COUNTRIES.map((c) => (
                  <Chip key={c.code} label={`${c.flag} ${t(`onboarding.country.${c.code}`)}`} selected={country === c.code} onPress={() => setCountry(c.code)} />
                ))}
              </View>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <Txt v="largeTitle">{t('onboarding.days.title')}</Txt>
              <Txt v="callout" color={p.muted} style={{ marginVertical: 10 }}>
                {t('onboarding.days.text')}
              </Txt>
              <WeekdayPicker value={days} onChange={setDays} />
            </>
          ) : null}

          {step === 2 ? (
            <>
              <Txt v="largeTitle">{t('onboarding.subjects.title')}</Txt>
              <Txt v="callout" color={p.muted} style={{ marginVertical: 10 }}>
                {t('onboarding.subjects.text')}
              </Txt>
              <Txt v="headline" style={{ marginTop: 4 }}>
                {t('onboarding.tpl.title')}
              </Txt>
              <Txt v="sub" color={p.muted} style={{ marginTop: 2, marginBottom: 10 }}>
                {t(country === 'KZ' ? 'onboarding.tpl.hintKZ' : 'onboarding.tpl.hint')}
              </Txt>
              <View style={styles.tplRow}>
                {GRADES.map(({ grade, emoji }) => {
                  const on = tpl === grade;
                  const n = gradeTemplate(country, grade).subjects.length;
                  return (
                    <Pressable
                      key={grade}
                      onPress={() => {
                        haptic.tap();
                        applyTemplate(grade);
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      style={({ pressed }) => [
                        styles.tpl,
                        { backgroundColor: on ? p.brandSoft : p.card, borderColor: on ? p.brand : p.line, borderWidth: on ? 1.5 : StyleSheet.hairlineWidth, transform: [{ scale: pressed ? 0.97 : 1 }] },
                      ]}
                    >
                      <Text style={{ fontSize: 26 }}>{emoji}</Text>
                      <Txt v="headline" color={on ? p.brand : p.ink} style={styles.tplTitle} numberOfLines={2}>
                        {t(`onboarding.tpl.${grade}`)}
                      </Txt>
                      <Txt v="sub" color={p.muted}>
                        {t(`onboarding.tpl.${grade}Grades`)}
                      </Txt>
                      <Txt v="sub" color={on ? p.brand : p.muted} style={{ marginTop: 4 }}>
                        {tn('onboarding.tpl.count', n)}
                      </Txt>
                    </Pressable>
                  );
                })}
              </View>
              {tpl ? (
                <Animated.View entering={FadeIn.duration(220)} style={[styles.applied, { backgroundColor: p.okSoft }]}>
                  <Icon name="checkmark-circle" size={16} color={p.ok} />
                  <Txt v="sub" color={p.ink2} style={{ flex: 1 }}>
                    {t('onboarding.tpl.applied')}
                  </Txt>
                </Animated.View>
              ) : null}
              <Txt v="sub" color={p.muted} style={{ marginTop: 18, marginBottom: 8 }}>
                {t('onboarding.tpl.or')}
              </Txt>
              <View style={styles.wrap}>
                {presets.map((s) => (
                  <Chip key={s.name} label={`${s.emoji} ${s.name}`} selected={has(s.name)} onPress={() => toggleSubject(s)} />
                ))}
                {subjects.filter((s) => !presets.some((x) => x.name === s.name)).map((s) => (
                  <Chip key={s.name} label={`${s.emoji} ${s.name}`} selected onPress={() => toggleSubject(s)} />
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Field value={custom} onChangeText={setCustom} placeholder={t('onboarding.subjects.customPh')} maxLength={40} />
                </View>
                <Btn
                  title={t('common.add')}
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
              <Txt v="largeTitle">{t('onboarding.schedule.title')}</Txt>
              <Txt v="callout" color={p.muted} style={{ marginVertical: 10 }}>
                {t('onboarding.schedule.text')}
              </Txt>
              <View style={styles.wrap}>
                {days.map((d) => (
                  <Chip key={d} label={`${wdShort(d)}${plan[d]?.length ? ` · ${plan[d].length}` : ''}`} selected={d === planDay} onPress={() => setPlanDay(d)} />
                ))}
              </View>
              <Txt v="headline" style={{ marginTop: 18, marginBottom: 8 }}>
                {wdLong(planDay)}
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
                          <Pressable
                            hitSlop={10}
                            accessibilityRole="button"
                            accessibilityLabel={t('onboarding.schedule.removeA11y', { name: n })}
                            onPress={() => setPlan({ ...plan, [planDay]: dayPlan.filter((_, j) => j !== i) })}
                          >
                            <Icon name="close-circle" size={22} color={p.muted} />
                          </Pressable>
                        }
                      />
                    );
                  })
                ) : (
                  <Row title={t('onboarding.schedule.empty')} subtitle={t('onboarding.schedule.emptyHint')} />
                )}
              </Group>
              <View style={[styles.wrap, { marginTop: 14 }]}>
                {subjects.map((s) => (
                  <Chip key={s.name} label={`${s.emoji} ${s.name}`} icon="add" tone="muted" onPress={() => setPlan({ ...plan, [planDay]: [...dayPlan, s.name] })} />
                ))}
              </View>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <Txt v="largeTitle">{t('onboarding.items.title')}</Txt>
              <Txt v="callout" color={p.muted} style={{ marginVertical: 10 }}>
                {t('onboarding.items.text')}
              </Txt>
              <Group>
                {items.map((it, i) => (
                  <ToggleRow
                    key={it.preset === undefined ? it.title : `preset-${it.preset}`}
                    icon={it.emoji}
                    title={titleOf(it)}
                    subtitle={it.needs_photo ? t('onboarding.items.withPhoto') : t('onboarding.items.checkmark')}
                    value={it.on}
                    onChange={(v) => setItems(items.map((x, j) => (j === i ? { ...x, on: v } : x)))}
                  />
                ))}
              </Group>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Field value={newItem} onChangeText={setNewItem} placeholder={t('onboarding.items.customPh')} maxLength={50} />
                </View>
                <Btn
                  title={t('common.add')}
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
              <Txt v="largeTitle">{t('onboarding.deadlines.title')}</Txt>
              <Txt v="callout" color={p.muted} style={{ marginVertical: 10 }}>
                {t('onboarding.deadlines.text')}
              </Txt>
              <Group>
                <Row icon="alarm" tint="orange" title={t('onboarding.deadlines.soft')} subtitle={t('onboarding.deadlines.softSub')} right={<TimeStepper value={soft} onChange={setSoft} clamp />} />
                <Row icon="moon" tint="violet" title={t('onboarding.deadlines.hard')} subtitle={t('onboarding.deadlines.hardSub')} right={<TimeStepper value={hard} onChange={setHard} clamp />} />
              </Group>
              {!deadlinesOk ? (
                <Txt v="callout" color={p.warn} style={{ marginTop: 14 }}>
                  {t('onboarding.deadlines.invalid')}
                </Txt>
              ) : null}
              <Pressable
                onPress={() => setConsent(!consent)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: consent }}
                style={[styles.consent, { borderColor: consent ? p.brand : p.line, backgroundColor: consent ? p.brandSoft : p.card }]}
              >
                <View style={[styles.box, { borderColor: consent ? p.brandFill : p.border, backgroundColor: consent ? p.brandFill : 'transparent' }]}>
                  {consent ? <Icon name="checkmark" size={16} color="#fff" /> : null}
                </View>
                <Txt v="callout" style={{ flex: 1 }}>
                  {t('onboarding.consent.a')}{' '}
                  <Txt v="callout" color={p.brand} onPress={() => Linking.openURL(legalUrl('terms', lang))}>
                    {t('onboarding.consent.terms')}
                  </Txt>{' '}
                  {t('onboarding.consent.and')}{' '}
                  <Txt v="callout" color={p.brand} onPress={() => Linking.openURL(legalUrl('privacy', lang))}>
                    {t('onboarding.consent.privacy')}
                  </Txt>{' '}
                  {t('onboarding.consent.b')}
                </Txt>
              </Pressable>
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
        <View style={[styles.column, { gap: 8 }]}>
          <Btn
            title={step === STEPS.length - 1 ? t('onboarding.create') : step === 3 && !Object.values(plan).some((l) => l.length) ? t('onboarding.later') : t('common.next')}
            onPress={next}
            disabled={!canNext}
            loading={busy}
          />
          {step === 2 && tpl && subjects.length > 0 ? <Btn title={t('onboarding.tpl.skip')} kind="plain" onPress={skipToEnd} /> : null}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  progress: { flex: 1, flexDirection: 'row', gap: 4 },
  bar: { flex: 1, height: 4, borderRadius: 2 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  column: { width: '100%', maxWidth: 640, alignSelf: 'center' },
  tplTitle: { marginTop: 6, fontSize: 15, lineHeight: 19 },
  tplRow: { flexDirection: 'row', gap: 8 },
  tpl: { flex: 1, minWidth: 0, borderRadius: radius.l, paddingVertical: 12, paddingHorizontal: 10 },
  applied: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.s, paddingVertical: 10, paddingHorizontal: 12, marginTop: 10 },
  doneSeal: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  doneWrap: { flex: 1, paddingHorizontal: 24, justifyContent: 'space-between' },
  consent: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', borderWidth: 1, borderRadius: radius.l, padding: 14, marginTop: 18 },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
});
