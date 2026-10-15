import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';

import { InviteSheet } from '@/components/InviteSheet';
import { Btn, Chip, Field, Group, Loading, Row, Screen, SectionLabel, Sheet, TimeStepper, Txt, useToast, WeekdayPicker } from '@/components/ui';
import { api, ApiError, legalUrl, type Me, type Role } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { shortDate, toMin } from '@/lib/format';
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
  // a pair saved invalid by an older build must stay editable, otherwise every step is rejected
  const broken = toMin(f.soft_deadline) >= toMin(f.hard_deadline);
  const setSoft = (v: string) => (broken || toMin(v) < toMin(f.hard_deadline) ? patch({ soft_deadline: v }) : toast.show('Срок должен быть раньше последнего срока'));
  const setHard = (v: string) => (broken || toMin(v) > toMin(f.soft_deadline) ? patch({ hard_deadline: v }) : toast.show('Последний срок должен быть позже срока'));

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
      {
        text: 'Отключить',
        style: 'destructive',
        onPress: () =>
          api
            .removeMember(id)
            .catch((e) => toast.show((e as Error).message))
            .finally(load),
      },
    ]);

  const deleteAll = () =>
    Alert.alert(
      'Удалить семью и все данные?',
      'Будут безвозвратно удалены расписание, задания, история и все фото, а все телефоны семьи отключатся. Подписку в App Store / Google Play отмените отдельно в настройках магазина.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить всё',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteFamily();
              await signOut();
              router.replace('/welcome');
            } catch (e) {
              toast.show((e as Error).message);
            }
          },
        },
      ],
    );
  const a = me.access;
  const subTitle = a.free_forever
    ? 'Бесплатный доступ'
    : !a.billing
      ? 'Тестовый доступ'
      : a.granted_until && new Date(a.granted_until) > new Date()
        ? `Подарочный доступ до ${shortDate(a.granted_until.slice(0, 10))}`
        : a.paid_until && a.active
          ? `${a.trial ? 'Пробный период' : 'Подписка'} до ${shortDate(a.paid_until.slice(0, 10))}`
          : 'Не активна';

  const parents = me.members.filter((m) => m.role === 'parent');
  const children = me.members.filter((m) => m.role === 'child');

  // Without a parent device nobody could invite, approve skips or edit the schedule again.
  const offerInvite = (title: string, msg: string) =>
    Alert.alert(title, msg, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Пригласить второго родителя', onPress: () => setInvite('parent') },
    ]);
  const logout = () => {
    if (parents.length <= 1)
      return offerInvite(
        'Вы единственный родитель',
        'Если выйти, в семье не останется родителя: никто не сможет одобрять пропуски, смотреть фото и менять расписание. Сначала пригласите второго родителя — например, на ваш новый телефон.',
      );
    Alert.alert('Выйти на этом телефоне?', 'Данные семьи сохранятся. Вернуться можно по коду от другого родителя.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Выйти',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.leave();
          } catch (e) {
            const status = e instanceof ApiError ? e.status : 0;
            // 401: this phone was already disconnected, so signing out locally is all that's left
            if (status !== 401) {
              if (status === 409) offerInvite('Не получилось выйти', (e as Error).message);
              else toast.show((e as Error).message);
              return load();
            }
          }
          await signOut();
          router.replace('/welcome');
        },
      },
    ]);
  };

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
          <Row icon="⏰" title="Срок" subtitle="Уведомление, если не готово" right={<TimeStepper value={f.soft_deadline} onChange={setSoft} clamp />} />
          <Row icon="🌙" title="Последний срок" subtitle="Финальная проверка" right={<TimeStepper value={f.hard_deadline} onChange={setHard} clamp />} />
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

        <SectionLabel>Фото</SectionLabel>
        <Group>
          <Row
            icon="🗂️"
            title="Хранить фото"
            subtitle={`${f.photo_retention_days} дн., потом удаляются автоматически`}
            right={<DaysStepper value={f.photo_retention_days} onChange={(v) => patch({ photo_retention_days: v })} />}
          />
        </Group>

        <SectionLabel>Подписка</SectionLabel>
        <Group>
          <Row icon="⭐" title={subTitle} subtitle={`Код семьи: ${f.code}`} />
        </Group>

        <SectionLabel>Документы</SectionLabel>
        <Group>
          <Row icon="📄" title="Пользовательское соглашение" chevron onPress={() => Linking.openURL(legalUrl('terms'))} />
          <Row icon="🔒" title="Политика конфиденциальности" chevron onPress={() => Linking.openURL(legalUrl('privacy'))} />
        </Group>

        <SectionLabel>Аккаунт</SectionLabel>
        <Group>
          <Row icon="🚪" title="Выйти на этом телефоне" danger onPress={logout} />
          <Row icon="🗑️" title="Удалить семью и все данные" danger onPress={deleteAll} />
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

// 7–40 days, in steps of one day (long press jumps by a week)
function DaysStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const p = usePalette();
  const set = (v: number) => onChange(Math.min(40, Math.max(7, v)));
  const btn = (d: number, label: string) => (
    <Pressable
      hitSlop={6}
      onPress={() => set(value + d)}
      onLongPress={() => set(value + d * 7)}
      disabled={(d < 0 && value <= 7) || (d > 0 && value >= 40)}
      accessibilityLabel={d < 0 ? 'Меньше дней' : 'Больше дней'}
      style={({ pressed }) => [styles.step, { backgroundColor: p.fill, opacity: (d < 0 && value <= 7) || (d > 0 && value >= 40) ? 0.4 : 1, transform: [{ scale: pressed ? 0.9 : 1 }] }]}
    >
      <Txt v="headline">{label}</Txt>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {btn(-1, '−')}
      <Txt v="headline" style={{ minWidth: 28, textAlign: 'center' }}>
        {value}
      </Txt>
      {btn(1, '+')}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  step: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
