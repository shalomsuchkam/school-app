import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { OverrideSheet } from '@/components/OverrideSheet';
import { VacationSheet } from '@/components/VacationSheet';
import { Banner, Btn, Chip, EmojiPicker, Empty, ErrorBanner, Field, Group, Icon, Loading, Row, Screen, SectionLabel, Segmented, Sheet, ToggleRow, Txt, useToast } from '@/components/ui';
import { api, type Child, type Family, type Override, type Setup, type Subject, type Vacation } from '@/lib/api';
import { useIsViewer } from '@/lib/auth';
import { ChildSwitcher, currentChildReady, getCurrentChild, setCurrentChild, useCurrentChild } from '@/lib/currentChild';
import { localIso, shortDate, wdLong, wdShort } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { EMOJIS, SUBJECT_PRESETS } from '@/lib/presets';
import { hairline, radius, space, usePalette } from '@/lib/theme';
import { listedVacations, rangeLabel, vacationLine } from '@/lib/vacation';

type Parity = 0 | 1 | 2;
// ISO week number parity of a date: 1 = odd week, 2 = even week (matches the server's lessons_alt keys)
function isoWeekParity(d: Date): 1 | 2 {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const wd = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - wd);
  const week = Math.ceil(((x.getTime() - Date.UTC(x.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
  return week % 2 ? 1 : 2;
}
// The family's calendar date (overrides are offered from today on, in family time).
function todayIn(tz: string) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return localIso(new Date());
  }
}
const hasAlt = (s: Setup) => (['1', '2'] as const).some((k) => Object.values(s.lessons_alt?.[k] ?? {}).some((ids) => ids.length));

export default function Schedule() {
  const p = usePalette();
  const t = useT();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [fam, setFam] = useState<Family | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kids, setKids] = useState<Child[]>([]);
  const [childId] = useCurrentChild(kids);
  const [day, setDay] = useState(() => {
    const w = new Date().getDay();
    return w === 0 ? 1 : w;
  });
  const [parity, setParity] = useState<Parity>(0);
  // the toggle follows the saved data; switching it on only shows the week picker until lessons are added
  const [altWanted, setAltWanted] = useState(false);
  const [nowParity] = useState(() => isoWeekParity(new Date()));
  // days off are offered from tomorrow on: computed once per mount, not on every render
  const [start] = useState(() => new Date());
  const [picker, setPicker] = useState(false);
  const [edit, setEdit] = useState<Partial<Subject> | null>(null);
  // picker and editor share one Sheet; keep showing the last content while it slides away
  const sheet = edit ? 'edit' : picker ? 'picker' : null;
  const [shown, setShown] = useState<'edit' | 'picker'>('picker');
  if (sheet && sheet !== shown) setShown(sheet);
  const toast = useToast();
  const viewer = useIsViewer();
  // one-day override editor: open flag + the date it opens on (null = next day)
  const [ovr, setOvr] = useState<{ date: string | null } | null>(null);
  // "add a school break" sheet
  const [vac, setVac] = useState(false);

  const load = useCallback(async () => {
    try {
      // lessons are per child; subjects are shared by the family
      const cid = await currentChildReady();
      const [s, me] = await Promise.all([api.setup(cid ?? undefined), api.me()]);
      if (getCurrentChild() !== cid) return; // switched to another child meanwhile
      setSetup(s);
      setKids(me.children);
      setFam(me.family);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  if (!setup || !fam) return <Loading error={error} onRetry={load} />;

  const byId = new Map(setup.subjects.map((s) => [s.id, s]));
  const altOn = altWanted || hasAlt(setup);
  const week: Parity = altOn ? parity : 0;
  const setOf = (w: Parity, d: number) => (w ? (setup.lessons_alt?.[w === 1 ? '1' : '2']?.[String(d)] ?? []) : (setup.lessons[String(d)] ?? []));
  const lessons = setOf(week, day);
  const isSchool = fam.school_weekdays.includes(day);

  // `to` pins the child, weekday and week: an undo from an older render must not write into whatever is shown now
  const saveLessons = async (ids: number[], to = { cid: setup.child_id, d: day, w: week }) => {
    const { cid, d, w } = to;
    setSetup((cur) => {
      if (!cur || cur.child_id !== cid) return cur; // switched to another child meanwhile
      if (!w) return { ...cur, lessons: { ...cur.lessons, [String(d)]: ids } };
      const k = w === 1 ? '1' : '2';
      const alt = cur.lessons_alt ?? { '1': {}, '2': {} };
      return { ...cur, lessons_alt: { ...alt, [k]: { ...alt[k], [String(d)]: ids } } };
    });
    try {
      await api.setLessons(d, ids, w, cid);
    } catch (e) {
      toast.show((e as Error).message);
      load();
    }
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= lessons.length) return;
    const next = [...lessons];
    [next[i], next[j]] = [next[j], next[i]];
    saveLessons(next);
  };
  const removeAt = (i: number) => {
    const before = lessons;
    const to = { cid: setup.child_id, d: day, w: week };
    saveLessons(lessons.filter((_, k) => k !== i), to);
    toast.show(t('parent.schedule.removed'), { label: t('parent.restore'), run: () => saveLessons(before, to) });
  };
  const toggleAlt = (on: boolean) => {
    if (on) {
      setAltWanted(true);
      setParity(nowParity);
      return;
    }
    if (!hasAlt(setup)) {
      setAltWanted(false);
      setParity(0);
      return;
    }
    Alert.alert(t('parent.schedule.altOffTitle'), t('parent.schedule.altOffMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('parent.schedule.altOff'),
        style: 'destructive',
        onPress: async () => {
          const jobs: Promise<unknown>[] = [];
          for (const k of ['1', '2'] as const)
            for (const [d, ids] of Object.entries(setup.lessons_alt?.[k] ?? {})) if (ids.length) jobs.push(api.setLessons(Number(d), [], k === '1' ? 1 : 2, setup.child_id));
          setSetup({ ...setup, lessons_alt: { '1': {}, '2': {} } });
          setAltWanted(false);
          setParity(0);
          try {
            await Promise.all(jobs);
          } catch (e) {
            toast.show((e as Error).message);
          }
          load();
        },
      },
    ]);
  };
  const switchChild = (id: number | null) => {
    if (id === null || id === setup.child_id) return;
    setCurrentChild(id);
    // show loading, not the previous child's timetable (an edit there would go to the wrong child)
    setSetup(null);
    setError(null);
    // the alternating-weeks toggle follows the other child's saved data
    setAltWanted(false);
    setParity(0);
    load();
  };
  const weekLabel = (w: Parity) => {
    const label = t(w === 0 ? 'parent.schedule.every' : w === 1 ? 'parent.schedule.odd' : 'parent.schedule.even');
    return w && w === nowParity ? t('parent.schedule.now', { label }) : label;
  };
  const toggleSchoolDay = async (on: boolean) => {
    const w = on ? [...fam.school_weekdays, day].sort() : fam.school_weekdays.filter((x) => x !== day);
    if (!w.length) return toast.show(t('parent.needSchoolDay'));
    setFam({ ...fam, school_weekdays: w });
    try {
      await api.updateFamily({ school_weekdays: w });
    } catch (e) {
      toast.show((e as Error).message);
      load(); // back to the saved days
    }
  };
  const saveSubject = async () => {
    if (!edit?.name?.trim()) return;
    try {
      if (edit.id) await api.updateSubject(edit.id, { name: edit.name.trim(), emoji: edit.emoji, light: edit.light });
      else {
        const s = await api.addSubject({ name: edit.name.trim(), emoji: edit.emoji ?? '📘', light: !!edit.light });
        if (picker) await saveLessons([...lessons, s.id]);
      }
      setEdit(null);
      load();
    } catch (e) {
      toast.show((e as Error).message);
    }
  };
  const deleteSubject = (s: Subject) =>
    Alert.alert(t('parent.schedule.deleteTitle', { name: s.name }), t('parent.schedule.deleteMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await api.deleteSubject(s.id).catch((e) => toast.show((e as Error).message));
          setEdit(null);
          load();
        },
      },
    ]);

  // next three weeks of school days for the "days off" picker
  const upcoming: string[] = [];
  for (let i = 1; upcoming.length < 15 && i < 40; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const w = d.getDay() === 0 ? 7 : d.getDay();
    const iso = localIso(d);
    // public holidays are listed separately (read-only)
    if (fam.school_weekdays.includes(w) && !setup.holidays?.includes(iso)) upcoming.push(iso);
  }
  const toggleOff = async (date: string) => {
    const off = !setup.days_off.includes(date);
    setSetup({ ...setup, days_off: off ? [...setup.days_off, date].sort() : setup.days_off.filter((x) => x !== date) });
    try {
      await api.dayOff(date, off);
      load(); // a day next to a school break joins or splits it in the list
    } catch (e) {
      toast.show((e as Error).message);
      load(); // back to the saved days off
    }
  };

  const today = todayIn(fam.tz);
  const vacations = listedVacations(setup.vacations, today, upcoming);
  const deleteVacation = (v: Vacation) => {
    setSetup({ ...setup, vacations: (setup.vacations ?? []).filter((x) => x.from !== v.from), days_off: setup.days_off.filter((d) => d < v.from || d > v.to) });
    api
      .daysOffRange(v.from, v.to, false)
      .then(
        () =>
          toast.show(t('parent.vac.deleted'), {
            label: t('parent.restore'),
            run: () =>
              api
                .daysOffRange(v.from, v.to, true, v.note)
                .then(load)
                .catch((e: Error) => toast.show(e.message)),
          }),
        (e: Error) => toast.show(e.message),
      )
      .finally(load);
  };
  const overrides = (setup.overrides ?? []).filter((o) => o.date >= today);
  const ovrLine = (o: Override) => {
    const names = o.subject_ids.map((id) => byId.get(id)?.name).filter(Boolean);
    const what = o.subject_ids.length === 0 ? t('parent.ovr.none') : names.length ? names.join(', ') : t('parent.ovr.none');
    return o.note ? `${what} · «${o.note}»` : what;
  };
  const deleteOverride = (o: Override) => {
    const cid = setup.child_id;
    setSetup({ ...setup, overrides: (setup.overrides ?? []).filter((x) => x.date !== o.date) });
    api
      .deleteOverride(o.date, cid)
      .then(
        () =>
          toast.show(t('parent.ovr.deleted'), {
            label: t('parent.restore'),
            run: () =>
              api
                .setOverride(o.date, { child_id: cid, subject_ids: o.subject_ids, note: o.note })
                .then(load)
                .catch((e: Error) => toast.show(e.message)),
          }),
        (e: Error) => toast.show(e.message),
      )
      .finally(load);
  };
  const overrideSection = (
    <>
      <SectionLabel right={viewer ? undefined : <Btn small kind="secondary" title={t('parent.ovr.action')} icon="swap-horizontal" onPress={() => setOvr({ date: null })} />}>
        {t('parent.ovr.list')}
      </SectionLabel>
      {overrides.length ? (
        <Group>
          {overrides.map((o) => (
            <Row
              key={o.date}
              icon="swap-horizontal"
              tint="violet"
              title={o.date === today ? `${t('parent.cal.today')}, ${shortDate(o.date)}` : shortDate(o.date)}
              subtitle={ovrLine(o)}
              onPress={viewer ? undefined : () => setOvr({ date: o.date })}
              right={
                viewer ? undefined : (
                  <Pressable
                    hitSlop={8}
                    onPress={() => deleteOverride(o)}
                    accessibilityRole="button"
                    accessibilityLabel={t('parent.ovr.deleteA11y', { date: shortDate(o.date) })}
                    style={({ pressed }) => [styles.mini, { backgroundColor: pressed ? p.badSoft : p.fill }]}
                  >
                    <Icon name="trash-outline" size={17} color={p.bad} />
                  </Pressable>
                )
              }
            />
          ))}
        </Group>
      ) : (
        <Txt v="sub" color={p.muted} style={{ marginLeft: 6 }}>
          {viewer ? t('parent.ovr.noneYetViewer') : t('parent.ovr.noneYet')}
        </Txt>
      )}
    </>
  );

  return (
    <>
      <Screen title={t('parent.tab.schedule')} subtitle={t('parent.schedule.subtitle')} onRefresh={load}>
        <ChildSwitcher list={kids} value={childId} onChange={switchChild} />
        <ErrorBanner error={error} onRetry={load} />
        <View style={styles.days}>
          {[1, 2, 3, 4, 5, 6, 7].map((d) => {
            const sel = d === day;
            const school = fam.school_weekdays.includes(d);
            const n = setOf(week, d).length;
            return (
              <Pressable
                key={d}
                onPress={() => setDay(d)}
                accessibilityRole="button"
                accessibilityState={{ selected: sel }}
                style={[styles.day, { backgroundColor: sel ? p.brandFill : school ? p.card : 'transparent', borderColor: sel ? p.brandFill : p.line }]}
              >
                {/* seven cells share the width: shrink the text instead of wrapping or clipping it */}
                <Txt v="headline" color={sel ? '#fff' : school ? p.ink : p.muted} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {wdShort(d)}
                </Txt>
                <Txt v="sub" color={sel ? 'rgba(255,255,255,0.85)' : p.muted} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontVariant: ['tabular-nums'] }}>
                  {school ? n || '–' : t('parent.schedule.dayOff')}
                </Txt>
              </Pressable>
            );
          })}
        </View>

        {viewer ? (
          <Banner tone="neutral" icon="eye-outline" text={t('parent.viewerMode.schedule')} />
        ) : (
          <Group style={{ marginTop: 14 }}>
            <ToggleRow icon="repeat" tint="violet" title={t('parent.schedule.alt')} subtitle={t('parent.schedule.altSub')} value={altOn} onChange={toggleAlt} />
          </Group>
        )}
        {altOn ? (
          <>
            <Segmented value={week} onChange={setParity} options={([0, 1, 2] as Parity[]).map((w) => ({ value: w, label: weekLabel(w) }))} style={{ marginTop: space.s }} />
            <Txt v="sub" color={p.muted} style={{ marginTop: 8, marginHorizontal: 6 }}>
              {t('parent.schedule.altHint')}
            </Txt>
          </>
        ) : null}

        <SectionLabel>{altOn ? `${wdLong(day)} · ${weekLabel(week)}` : wdLong(day)}</SectionLabel>
        {viewer ? null : (
          <Group>
            <ToggleRow icon="school" tint="blue" title={t('parent.schedule.schoolDay')} value={isSchool} onChange={toggleSchoolDay} />
          </Group>
        )}

        {isSchool ? (
          <>
            <SectionLabel right={viewer ? undefined : <Btn small kind="secondary" title={t('common.add')} icon="＋" onPress={() => setPicker(true)} />}>{t('parent.schedule.lessons', { n: lessons.length })}</SectionLabel>
            {lessons.length ? (
              <Group>
                {lessons.map((id, i) => {
                  const s = byId.get(id);
                  const name = s?.name ?? t('parent.schedule.subject');
                  return (
                    <Row
                      key={`${id}-${i}`}
                      icon={s?.emoji ?? '📘'}
                      title={`${i + 1}. ${name}`}
                      subtitle={s?.light ? t('parent.schedule.light') : undefined}
                      right={
                        viewer ? undefined : <View style={{ flexDirection: 'row', gap: 4 }}>
                          <Pressable
                            hitSlop={6}
                            disabled={i === 0}
                            onPress={() => move(i, -1)}
                            accessibilityRole="button"
                            accessibilityLabel={t('parent.schedule.upA11y', { name })}
                            accessibilityState={{ disabled: i === 0 }}
                            style={[styles.mini, { backgroundColor: p.fill, opacity: i === 0 ? 0.35 : 1 }]}>
                            <Icon name="chevron-up" size={17} color={p.ink2} />
                          </Pressable>
                          <Pressable
                            hitSlop={6}
                            disabled={i === lessons.length - 1}
                            onPress={() => move(i, 1)}
                            accessibilityRole="button"
                            accessibilityLabel={t('parent.schedule.downA11y', { name })}
                            accessibilityState={{ disabled: i === lessons.length - 1 }}
                            style={[styles.mini, { backgroundColor: p.fill, opacity: i === lessons.length - 1 ? 0.35 : 1 }]}>
                            <Icon name="chevron-down" size={17} color={p.ink2} />
                          </Pressable>
                          <Pressable
                            hitSlop={6}
                            onPress={() => removeAt(i)}
                            accessibilityRole="button"
                            accessibilityLabel={t('parent.schedule.removeA11y', { name })}
                            style={[styles.mini, { backgroundColor: p.badSoft }]}>
                            <Icon name="close" size={17} color={p.bad} />
                          </Pressable>
                        </View>
                      }
                    />
                  );
                })}
              </Group>
            ) : (
              <Group>
                <Empty icon="book-outline" title={t('parent.schedule.noLessons')} text={viewer ? undefined : t('parent.schedule.noLessonsText', { add: t('common.add') })}>
                  {week && setOf(0, day).length && !viewer ? (
                    <Btn small kind="secondary" icon="copy-outline" title={t('parent.schedule.copyEvery')} onPress={() => saveLessons(setOf(0, day))} style={{ marginTop: 14 }} />
                  ) : null}
                </Empty>
              </Group>
            )}
          </>
        ) : (
          <Txt v="callout" color={p.muted} style={{ marginTop: 12, marginLeft: 6 }}>
            {t('parent.schedule.noTasks')}
          </Txt>
        )}

        {overrideSection}

        <SectionLabel right={viewer ? undefined : <Btn small kind="secondary" title={t('parent.schedule.new')} icon="＋" onPress={() => setEdit({ emoji: '📘', light: false, name: '' })} />}>
          {t('parent.schedule.subjects', { n: setup.subjects.length })}
        </SectionLabel>
        {setup.subjects.length ? (
          <Group>
            {setup.subjects.map((s) => (
              <Row key={s.id} icon={s.emoji} title={s.name} subtitle={s.light ? t('parent.schedule.light') : undefined} chevron={!viewer} onPress={viewer ? undefined : () => setEdit(s)} />
            ))}
          </Group>
        ) : viewer ? null : (
          <View style={styles.wrap}>
            {SUBJECT_PRESETS.map((s) => (
              <Chip
                key={s.name}
                label={`＋ ${s.emoji} ${s.name}`}
                tone="muted"
                onPress={() =>
                  api
                    .addSubject(s)
                    .then(load)
                    .catch((e) => toast.show((e as Error).message))
                }
              />
            ))}
          </View>
        )}

        <SectionLabel right={viewer ? undefined : <Btn small kind="secondary" title={t('parent.vac.add')} icon="＋" onPress={() => setVac(true)} />}>{t('parent.schedule.daysOff')}</SectionLabel>
        {vacations.length ? (
          <Group>
            {vacations.map((v) => {
              const line = vacationLine(v);
              return (
                <Row
                  key={v.from}
                  icon="airplane-outline"
                  tint="orange"
                  title={line.title}
                  subtitle={line.subtitle}
                  right={
                    viewer ? undefined : (
                      <Pressable
                        hitSlop={8}
                        onPress={() => deleteVacation(v)}
                        accessibilityRole="button"
                        accessibilityLabel={t('parent.vac.deleteA11y', { name: line.title, dates: rangeLabel(v.from, v.to) })}
                        style={({ pressed }) => [styles.mini, { backgroundColor: pressed ? p.badSoft : p.fill }]}
                      >
                        <Icon name="trash-outline" size={17} color={p.bad} />
                      </Pressable>
                    )
                  }
                />
              );
            })}
          </Group>
        ) : (
          <Txt v="sub" color={p.muted} style={{ marginLeft: 6 }}>
            {viewer ? t('parent.vac.noneViewer') : t('parent.vac.none')}
          </Txt>
        )}
        <Txt v="sub" color={p.ink2} style={{ marginTop: 16, marginBottom: 4, marginLeft: 6, fontWeight: '600' }}>
          {t('parent.vac.single')}
        </Txt>
        <Txt v="sub" color={p.muted} style={{ marginBottom: 8, marginLeft: 6 }}>
          {viewer ? t('parent.ovr.daysOffViewer') : t('parent.schedule.daysOffHint')}
        </Txt>
        <View style={styles.wrap}>
          {(viewer ? upcoming.filter((d) => setup.days_off.includes(d)) : upcoming).map((d) => (
            <Chip key={d} label={shortDate(d)} icon={setup.days_off.includes(d) ? 'bed-outline' : undefined} selected={setup.days_off.includes(d)} onPress={viewer ? undefined : () => toggleOff(d)} />
          ))}
        </View>
        {setup.holidays?.length ? (
          <>
            <Txt v="sub" color={p.muted} style={{ marginTop: 16, marginBottom: 4, marginLeft: 6 }}>
              {t('parent.schedule.holidays')}
            </Txt>
            <Txt v="sub" color={p.muted} style={{ marginBottom: 8, marginLeft: 6 }}>
              {t('parent.schedule.holidaysHint')}
            </Txt>
            <View style={styles.wrap}>
              {setup.holidays.map((d) => (
                <Chip key={d} label={shortDate(d)} icon="flag-outline" tone="muted" />
              ))}
            </View>
          </>
        ) : null}
      </Screen>

      {/* One Modal for both: swapping two sibling Modals in one update never presents the second on iOS */}
      <Sheet
        visible={sheet !== null}
        title={shown === 'edit' ? (edit?.id ? t('parent.schedule.subject') : t('parent.schedule.newSubject')) : t('parent.schedule.lessonOn', { wd: wdShort(day) })}
        onClose={shown === 'edit' ? () => setEdit(null) : () => setPicker(false)}
        overlay={toast.node}
      >
        {shown === 'edit' ? (
          <>
            <Field label={t('parent.schedule.name')} value={edit?.name ?? ''} onChangeText={(name) => setEdit({ ...edit, name })} placeholder={t('parent.schedule.namePh')} maxLength={40} />
            <Txt v="sub" color={p.muted} style={{ marginBottom: 8, marginLeft: 4 }}>
              {t('parent.icon')}
            </Txt>
            <EmojiPicker value={edit?.emoji ?? '📘'} options={EMOJIS} onChange={(emoji) => setEdit({ ...edit, emoji })} />
            <Group style={{ marginTop: 14 }}>
              <ToggleRow title={t('parent.schedule.light')} subtitle={t('parent.schedule.lightHint')} value={!!edit?.light} onChange={(light) => setEdit({ ...edit, light })} />
            </Group>
            <Btn title={t('common.save')} onPress={saveSubject} disabled={!edit?.name?.trim()} style={{ marginTop: 16 }} />
            {edit?.id ? <Btn title={t('parent.schedule.deleteSubject')} kind="plain" onPress={() => deleteSubject(edit as Subject)} style={{ marginTop: 10 }} /> : null}
          </>
        ) : (
          <>
            {setup.subjects.length ? (
              <Group>
                {setup.subjects.map((s) => (
                  <Row
                    key={s.id}
                    icon={s.emoji}
                    title={s.name}
                    right={<Icon name="add-circle" size={24} color={p.brand} />}
                    onPress={() => {
                      saveLessons([...lessons, s.id]);
                      toast.show(t('parent.schedule.added', { name: `${s.emoji} ${s.name}` }));
                    }}
                  />
                ))}
              </Group>
            ) : null}
            <Btn title={t('parent.schedule.newSubject')} icon="＋" kind="secondary" style={{ marginTop: 14 }} onPress={() => setEdit({ emoji: '📘', light: false, name: '' })} />
          </>
        )}
      </Sheet>
      {viewer ? null : (
        <OverrideSheet
          visible={ovr !== null}
          setup={setup}
          today={today}
          date={ovr?.date}
          onClose={() => setOvr(null)}
          onSaved={(msg) => {
            setOvr(null);
            toast.show(msg);
            load();
          }}
        />
      )}
      {viewer ? null : (
        <VacationSheet
          visible={vac}
          today={today}
          onClose={() => setVac(false)}
          onSaved={(msg) => {
            setVac(false);
            toast.show(msg);
            load();
          }}
        />
      )}
      {sheet || ovr || vac ? null : toast.node}
    </>
  );
}

const styles = StyleSheet.create({
  days: { flexDirection: 'row', gap: 6 },
  day: { flex: 1, borderRadius: radius.m, borderWidth: hairline, paddingVertical: 10, alignItems: 'center', minHeight: 56 },
  mini: { width: 32, height: 32, borderRadius: radius.s, alignItems: 'center', justifyContent: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
});
