import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Btn, Chip, EmojiPicker, Empty, Field, Group, Loading, Row, Screen, SectionLabel, Sheet, ToggleRow, Txt, useToast } from '@/components/ui';
import { api, type Family, type Setup, type Subject } from '@/lib/api';
import { localIso, shortDate, WD_LONG, WD_SHORT } from '@/lib/format';
import { EMOJIS, SUBJECT_PRESETS } from '@/lib/presets';
import { usePalette } from '@/lib/theme';

export default function Schedule() {
  const p = usePalette();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [fam, setFam] = useState<Family | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState(() => {
    const w = new Date().getDay();
    return w === 0 ? 1 : w;
  });
  const [picker, setPicker] = useState(false);
  const [edit, setEdit] = useState<Partial<Subject> | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const [s, me] = await Promise.all([api.setup(), api.me()]);
      setSetup(s);
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
  const lessons = setup.lessons[String(day)] ?? [];
  const isSchool = fam.school_weekdays.includes(day);

  const saveLessons = async (ids: number[]) => {
    setSetup({ ...setup, lessons: { ...setup.lessons, [String(day)]: ids } });
    try {
      await api.setLessons(day, ids);
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
    saveLessons(lessons.filter((_, k) => k !== i));
    toast.show('Урок убран', { label: 'Вернуть', run: () => saveLessons(before) });
  };
  const toggleSchoolDay = async (on: boolean) => {
    const w = on ? [...fam.school_weekdays, day].sort() : fam.school_weekdays.filter((x) => x !== day);
    if (!w.length) return toast.show('Нужен хотя бы один учебный день');
    setFam({ ...fam, school_weekdays: w });
    await api.updateFamily({ school_weekdays: w }).catch((e) => toast.show((e as Error).message));
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
    Alert.alert(`Удалить «${s.name}»?`, 'Предмет исчезнет из всех дней расписания.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
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
    const d = new Date();
    d.setDate(d.getDate() + i);
    const w = d.getDay() === 0 ? 7 : d.getDay();
    if (fam.school_weekdays.includes(w)) upcoming.push(localIso(d));
  }
  const toggleOff = async (date: string) => {
    const off = !setup.days_off.includes(date);
    setSetup({ ...setup, days_off: off ? [...setup.days_off, date].sort() : setup.days_off.filter((x) => x !== date) });
    await api.dayOff(date, off).catch((e) => toast.show((e as Error).message));
  };

  return (
    <>
      <Screen title="Расписание" subtitle="Уроки по дням недели" onRefresh={load}>
        <View style={styles.days}>
          {[1, 2, 3, 4, 5, 6, 7].map((d) => {
            const sel = d === day;
            const school = fam.school_weekdays.includes(d);
            const n = (setup.lessons[String(d)] ?? []).length;
            return (
              <Pressable key={d} onPress={() => setDay(d)} style={[styles.day, { backgroundColor: sel ? p.brand : p.card, opacity: school || sel ? 1 : 0.55 }]}>
                <Txt v="headline" color={sel ? '#fff' : p.ink}>
                  {WD_SHORT[d - 1]}
                </Txt>
                <Txt v="sub" color={sel ? 'rgba(255,255,255,0.8)' : p.muted}>
                  {school ? n || '–' : 'вых'}
                </Txt>
              </Pressable>
            );
          })}
        </View>

        <SectionLabel>{WD_LONG[day - 1]}</SectionLabel>
        <Group>
          <ToggleRow icon="🏫" title="Учебный день" value={isSchool} onChange={toggleSchoolDay} />
        </Group>

        {isSchool ? (
          <>
            <SectionLabel right={<Btn small kind="secondary" title="Добавить" icon="＋" onPress={() => setPicker(true)} />}>Уроки · {lessons.length}</SectionLabel>
            {lessons.length ? (
              <Group>
                {lessons.map((id, i) => {
                  const s = byId.get(id);
                  return (
                    <Row
                      key={`${id}-${i}`}
                      icon={s?.emoji ?? '📘'}
                      title={`${i + 1}. ${s?.name ?? 'Предмет'}`}
                      subtitle={s?.light ? 'Обычно без ДЗ' : undefined}
                      right={
                        <View style={{ flexDirection: 'row', gap: 4 }}>
                          <Pressable hitSlop={6} disabled={i === 0} onPress={() => move(i, -1)} style={[styles.mini, { backgroundColor: p.fill, opacity: i === 0 ? 0.35 : 1 }]}>
                            <Txt v="callout">↑</Txt>
                          </Pressable>
                          <Pressable hitSlop={6} disabled={i === lessons.length - 1} onPress={() => move(i, 1)} style={[styles.mini, { backgroundColor: p.fill, opacity: i === lessons.length - 1 ? 0.35 : 1 }]}>
                            <Txt v="callout">↓</Txt>
                          </Pressable>
                          <Pressable hitSlop={6} onPress={() => removeAt(i)} style={[styles.mini, { backgroundColor: p.badSoft }]}>
                            <Txt v="callout" color={p.bad}>
                              ✕
                            </Txt>
                          </Pressable>
                        </View>
                      }
                    />
                  );
                })}
              </Group>
            ) : (
              <Group>
                <Empty icon="📭" title="Уроков нет" text="Нажмите «Добавить», чтобы составить день." />
              </Group>
            )}
          </>
        ) : (
          <Txt v="callout" color={p.muted} style={{ marginTop: 12, marginLeft: 6 }}>
            В этот день заданий не будет.
          </Txt>
        )}

        <SectionLabel right={<Btn small kind="secondary" title="Новый" icon="＋" onPress={() => setEdit({ emoji: '📘', light: false, name: '' })} />}>
          Предметы · {setup.subjects.length}
        </SectionLabel>
        {setup.subjects.length ? (
          <Group>
            {setup.subjects.map((s) => (
              <Row key={s.id} icon={s.emoji} title={s.name} subtitle={s.light ? 'Обычно без ДЗ' : undefined} chevron onPress={() => setEdit(s)} />
            ))}
          </Group>
        ) : (
          <View style={styles.wrap}>
            {SUBJECT_PRESETS.map((s) => (
              <Chip key={s.name} label={`＋ ${s.emoji} ${s.name}`} tone="muted" onPress={() => api.addSubject(s).then(load)} />
            ))}
          </View>
        )}

        <SectionLabel>Выходные и каникулы</SectionLabel>
        <Txt v="sub" color={p.muted} style={{ marginBottom: 8, marginLeft: 6 }}>
          Отметьте дни без уроков — задания на них не появятся.
        </Txt>
        <View style={styles.wrap}>
          {upcoming.map((d) => (
            <Chip key={d} label={`${setup.days_off.includes(d) ? '🏖 ' : ''}${shortDate(d)}`} selected={setup.days_off.includes(d)} onPress={() => toggleOff(d)} />
          ))}
        </View>
      </Screen>

      <Sheet visible={picker && !edit} title={`Урок на ${WD_SHORT[day - 1]}`} onClose={() => setPicker(false)}>
        {setup.subjects.length ? (
          <Group>
            {setup.subjects.map((s) => (
              <Row
                key={s.id}
                icon={s.emoji}
                title={s.name}
                right={<Txt v="headline" color={p.brand}>＋</Txt>}
                onPress={() => {
                  saveLessons([...lessons, s.id]);
                  toast.show(`${s.emoji} ${s.name} добавлен`);
                }}
              />
            ))}
          </Group>
        ) : null}
        <Btn title="Новый предмет" icon="＋" kind="secondary" style={{ marginTop: 14 }} onPress={() => setEdit({ emoji: '📘', light: false, name: '' })} />
      </Sheet>

      <Sheet visible={!!edit} title={edit?.id ? 'Предмет' : 'Новый предмет'} onClose={() => setEdit(null)}>
        <Field label="Название" value={edit?.name ?? ''} onChangeText={(name) => setEdit({ ...edit, name })} placeholder="Например, Геометрия" maxLength={40} />
        <Txt v="sub" color={p.muted} style={{ marginBottom: 8, marginLeft: 4 }}>
          Значок
        </Txt>
        <EmojiPicker value={edit?.emoji ?? '📘'} options={EMOJIS} onChange={(emoji) => setEdit({ ...edit, emoji })} />
        <Group style={{ marginTop: 14 }}>
          <ToggleRow title="Обычно без ДЗ" subtitle="Кнопка «Нет ДЗ» будет первой" value={!!edit?.light} onChange={(light) => setEdit({ ...edit, light })} />
        </Group>
        <Btn title="Сохранить" onPress={saveSubject} disabled={!edit?.name?.trim()} style={{ marginTop: 16 }} />
        {edit?.id ? <Btn title="Удалить предмет" kind="plain" onPress={() => deleteSubject(edit as Subject)} style={{ marginTop: 10 }} /> : null}
      </Sheet>
      {toast.node}
    </>
  );
}

const styles = StyleSheet.create({
  days: { flexDirection: 'row', gap: 6 },
  day: { flex: 1, borderRadius: 14, paddingVertical: 10, alignItems: 'center' },
  mini: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
