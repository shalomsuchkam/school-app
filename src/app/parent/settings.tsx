import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';

import { InviteSheet } from '@/components/InviteSheet';
import { Btn, Chip, Field, Group, Loading, Row, Screen, SectionLabel, Sheet, TimeStepper, Txt, useToast, WeekdayPicker } from '@/components/ui';
import { api, type Me, type Role } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { toMin } from '@/lib/format';
import { usePalette } from '@/lib/theme';

export default function Settings() {
  const p = usePalette();
  const { signOut } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nameEdit, setNameEdit] = useState<string | null>(null);
  const [newTime, setNewTime] = useState<string | null>(null);
  const [invite, setInvite] = useState<Role | null>(null);
  const [tgBusy, setTgBusy] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      setMe(await api.me());
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
  if (!me) return <Loading error={error} onRetry={load} />;
  const f = me.family;

  const patch = async (x: Parameters<typeof api.updateFamily>[0], msg?: string) => {
    setMe({ ...me, family: { ...f, ...x } });
    try {
      await api.updateFamily(x);
      if (msg) toast.show(msg);
    } catch (e) {
      toast.show((e as Error).message);
      load();
    }
  };
  const setSoft = (v: string) => (toMin(v) < toMin(f.hard_deadline) ? patch({ soft_deadline: v }) : toast.show('Срок должен быть раньше последнего срока'));
  const setHard = (v: string) => (toMin(v) > toMin(f.soft_deadline) ? patch({ hard_deadline: v }) : toast.show('Последний срок должен быть позже срока'));

  const connectTelegram = async () => {
    setTgBusy(true);
    try {
      const { url } = await api.telegramLink();
      await Linking.openURL(url);
      toast.show('Нажмите «Start» в Telegram, затем вернитесь сюда');
    } catch (e) {
      toast.show((e as Error).message);
    } finally {
      setTgBusy(false);
    }
  };
  const disconnectTelegram = async () => {
    await api.telegramUnlink().catch(() => {});
    load();
  };
  const removeMember = (id: string, label: string) =>
    Alert.alert(`Отключить ${label}?`, 'Устройство выйдет из семьи. Подключить снова можно новым кодом.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Отключить', style: 'destructive', onPress: () => api.removeMember(id).then(load) },
    ]);
  const logout = () =>
    Alert.alert('Выйти на этом телефоне?', 'Данные семьи сохранятся. Вернуться можно по коду от другого родителя.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Выйти',
        style: 'destructive',
        onPress: async () => {
          await api.leave().catch(() => {});
          await signOut();
          router.replace('/welcome');
        },
      },
    ]);

  const parents = me.members.filter((m) => m.role === 'parent');
  const children = me.members.filter((m) => m.role === 'child');

  return (
    <>
      <Screen title="Настройки" onRefresh={load}>
        <SectionLabel>Ученик</SectionLabel>
        <Group>
          <Row icon="🎓" title={f.child_name} subtitle="Имя в приложении и уведомлениях" chevron onPress={() => setNameEdit(f.child_name)} />
        </Group>

        <SectionLabel>Учебные дни</SectionLabel>
        <WeekdayPicker value={f.school_weekdays} onChange={(w) => (w.length ? patch({ school_weekdays: w }) : toast.show('Нужен хотя бы один учебный день'))} />

        <SectionLabel>Сроки</SectionLabel>
        <Group>
          <Row icon="⏰" title="Срок" subtitle="Уведомление, если не готово" right={<TimeStepper value={f.soft_deadline} onChange={setSoft} />} />
          <Row icon="🌙" title="Последний срок" subtitle="Финальная проверка" right={<TimeStepper value={f.hard_deadline} onChange={setHard} />} />
        </Group>

        <SectionLabel right={<Btn small kind="secondary" title="Время" icon="＋" onPress={() => setNewTime('16:00')} />}>Напоминания ученику</SectionLabel>
        <View style={styles.wrap}>
          {f.remind_times.length ? (
            f.remind_times.map((t) => (
              <Chip key={t} label={`${t}  ✕`} onPress={() => patch({ remind_times: f.remind_times.filter((x) => x !== t) })} />
            ))
          ) : (
            <Txt v="callout" color={p.muted} style={{ marginLeft: 6 }}>
              Только перед сроком
            </Txt>
          )}
        </View>

        <SectionLabel>Семья</SectionLabel>
        <Group>
          {[...parents, ...children].map((m) => (
            <Row
              key={m.id}
              icon={m.role === 'parent' ? '🧑' : '🎒'}
              title={`${m.name || (m.role === 'parent' ? 'Родитель' : 'Ученик')}${m.me ? ' · это вы' : ''}`}
              subtitle={`${m.role === 'parent' ? 'Родитель' : 'Ученик'}${m.telegram ? ' · Telegram' : ''}`}
              right={
                !m.me ? (
                  <Pressable hitSlop={8} onPress={() => removeMember(m.id, m.name || 'устройство')}>
                    <Txt v="sub" color={p.bad}>
                      Отключить
                    </Txt>
                  </Pressable>
                ) : undefined
              }
            />
          ))}
          <Row icon="➕" title="Пригласить ученика" chevron onPress={() => setInvite('child')} />
          <Row icon="👪" title="Пригласить второго родителя" chevron onPress={() => setInvite('parent')} />
        </Group>

        <SectionLabel>Уведомления</SectionLabel>
        <Group>
          {me.telegram.linked ? (
            <Row
              icon="✈️"
              title="Telegram подключён"
              subtitle="Фото, запросы и тревоги приходят в Telegram"
              right={
                <Pressable hitSlop={8} onPress={disconnectTelegram}>
                  <Txt v="sub" color={p.bad}>
                    Отключить
                  </Txt>
                </Pressable>
              }
            />
          ) : (
            <Row
              icon="✈️"
              title="Получать в Telegram"
              subtitle={me.telegram.enabled ? 'Фото и одобрения кнопками прямо в чате' : 'Опция появится после настройки бота'}
              disabled={!me.telegram.enabled || tgBusy}
              chevron={me.telegram.enabled}
              onPress={connectTelegram}
            />
          )}
          <Row icon="🔔" title="Уведомления в приложении" subtitle="Включатся после публикации в App Store и Google Play" disabled />
        </Group>

        <SectionLabel>Аккаунт</SectionLabel>
        <Group>
          <Row icon="🚪" title="Выйти на этом телефоне" danger onPress={logout} />
        </Group>
        <Txt v="sub" color={p.muted} style={{ textAlign: 'center', marginTop: 20 }}>
          Уроки · версия 1.0
        </Txt>
      </Screen>

      <Sheet visible={nameEdit !== null} title="Имя ученика" onClose={() => setNameEdit(null)}>
        <Field value={nameEdit ?? ''} onChangeText={setNameEdit} maxLength={30} autoFocus />
        <Btn
          title="Сохранить"
          disabled={!nameEdit?.trim()}
          onPress={() => {
            patch({ child_name: nameEdit!.trim() }, 'Сохранено');
            setNameEdit(null);
          }}
        />
      </Sheet>
      <Sheet visible={newTime !== null} title="Новое напоминание" onClose={() => setNewTime(null)}>
        <View style={{ alignItems: 'center', marginVertical: 10 }}>
          <TimeStepper value={newTime ?? '16:00'} onChange={setNewTime} />
        </View>
        <Txt v="sub" color={p.muted} style={{ textAlign: 'center', marginBottom: 14 }}>
          Ученик получит напоминание в это время, если не всё готово
        </Txt>
        <Btn
          title="Добавить"
          onPress={() => {
            if (newTime && !f.remind_times.includes(newTime)) patch({ remind_times: [...f.remind_times, newTime].sort() }, 'Напоминание добавлено');
            setNewTime(null);
          }}
        />
      </Sheet>
      <InviteSheet role={invite} onClose={() => setInvite(null)} />
      {toast.node}
    </>
  );
}

const styles = StyleSheet.create({ wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } });
