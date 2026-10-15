import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';

import { InviteSheet } from '@/components/InviteSheet';
import { Btn, Chip, Field, Group, Loading, Row, Screen, SectionLabel, Sheet, TimeStepper, Txt, useToast, WeekdayPicker } from '@/components/ui';
import { openManage } from '@/lib/billing';
import { api, ApiError, legalUrl, type Me, type Role } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { shortDate, toMin } from '@/lib/format';
import { getLang, LANGS, setLang, tn, useT, type Lang } from '@/lib/i18n';
import { usePalette } from '@/lib/theme';

export default function Settings() {
  const p = usePalette();
  const { signOut } = useAuth();
  const t = useT();
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
  const setSoft = (v: string) => (broken || toMin(v) < toMin(f.hard_deadline) ? patch({ soft_deadline: v }) : toast.show(t('parent.settings.softErr')));
  const setHard = (v: string) => (broken || toMin(v) > toMin(f.soft_deadline) ? patch({ hard_deadline: v }) : toast.show(t('parent.settings.hardErr')));

  const connectTelegram = async () => {
    setTgBusy(true);
    try {
      const { url } = await api.telegramLink();
      await Linking.openURL(url);
      toast.show(t('parent.settings.tgStart'));
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
    Alert.alert(t('parent.settings.removeTitle', { label }), t('parent.settings.removeMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('parent.settings.disconnect'),
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
      t('parent.settings.deleteTitle'),
      t('parent.settings.deleteMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('parent.settings.deleteAll'),
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
    ? t('parent.settings.subFree')
    : !a.billing
      ? t('parent.settings.subTest')
      : a.granted_until && new Date(a.granted_until) > new Date()
        ? t('parent.settings.subGift', { date: shortDate(a.granted_until.slice(0, 10)) })
        : a.paid_until && a.active
          ? t(a.trial ? 'parent.settings.subTrial' : 'parent.settings.subPaid', { date: shortDate(a.paid_until.slice(0, 10)) })
          : t('parent.settings.subInactive');

  const changeLang = (l: Lang) => {
    if (l === getLang()) return;
    setLang(l);
    patch({ lang: l });
  };
  const countryKey = `parent.country.${f.country}`;
  const countryName = t(countryKey) === countryKey ? f.country : t(countryKey);

  const parents = me.members.filter((m) => m.role === 'parent');
  const children = me.members.filter((m) => m.role === 'child');

  // Without a parent device nobody could invite, approve skips or edit the schedule again.
  const offerInvite = (title: string, msg: string) =>
    Alert.alert(title, msg, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('parent.settings.inviteParent'), onPress: () => setInvite('parent') },
    ]);
  const logout = () => {
    if (parents.length <= 1)
      return offerInvite(t('parent.settings.onlyParentTitle'), t('parent.settings.onlyParentMsg'));
    Alert.alert(t('parent.settings.logoutTitle'), t('parent.settings.logoutMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('parent.settings.logout'),
        style: 'destructive',
        onPress: async () => {
          try {
            await api.leave();
          } catch (e) {
            const status = e instanceof ApiError ? e.status : 0;
            // 401: this phone was already disconnected, so signing out locally is all that's left
            if (status !== 401) {
              if (status === 409) offerInvite(t('parent.settings.logoutFail'), (e as Error).message);
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
      <Screen title={t('parent.tab.settings')} onRefresh={load}>
        <SectionLabel>{t('parent.settings.student')}</SectionLabel>
        <Group>
          <Row icon="🎓" title={f.child_name} subtitle={t('parent.settings.nameSub')} chevron onPress={() => setNameEdit(f.child_name)} />
        </Group>

        <SectionLabel>{t('parent.settings.schoolDays')}</SectionLabel>
        <WeekdayPicker value={f.school_weekdays} onChange={(w) => (w.length ? patch({ school_weekdays: w }) : toast.show(t('parent.needSchoolDay')))} />

        <SectionLabel>{t('parent.settings.deadlines')}</SectionLabel>
        <Group>
          <Row icon="⏰" title={t('parent.settings.soft')} subtitle={t('parent.settings.softSub')} right={<TimeStepper value={f.soft_deadline} onChange={setSoft} clamp />} />
          <Row icon="🌙" title={t('parent.settings.hard')} subtitle={t('parent.settings.hardSub')} right={<TimeStepper value={f.hard_deadline} onChange={setHard} clamp />} />
        </Group>

        <SectionLabel right={<Btn small kind="secondary" title={t('parent.settings.time')} icon="＋" onPress={() => setNewTime('16:00')} />}>{t('parent.settings.reminders')}</SectionLabel>
        <View style={styles.wrap}>
          {f.remind_times.length ? (
            f.remind_times.map((hm) => (
              <Chip key={hm} label={`${hm}  ✕`} onPress={() => patch({ remind_times: f.remind_times.filter((x) => x !== hm) })} />
            ))
          ) : (
            <Txt v="callout" color={p.muted} style={{ marginLeft: 6 }}>
              {t('parent.settings.onlyBefore')}
            </Txt>
          )}
        </View>

        <SectionLabel>{t('parent.settings.family')}</SectionLabel>
        <Group>
          {[...parents, ...children].map((m) => (
            <Row
              key={m.id}
              icon={m.role === 'parent' ? '🧑' : '🎒'}
              title={`${m.name || (m.role === 'parent' ? t('parent.settings.parent') : t('parent.settings.student'))}${m.me ? t('parent.settings.you') : ''}`}
              subtitle={`${m.role === 'parent' ? t('parent.settings.parent') : t('parent.settings.student')}${m.telegram ? ' · Telegram' : ''}`}
              right={
                !m.me ? (
                  <Pressable hitSlop={8} onPress={() => removeMember(m.id, m.name || t('parent.settings.device'))}>
                    <Txt v="sub" color={p.bad}>
                      {t('parent.settings.disconnect')}
                    </Txt>
                  </Pressable>
                ) : undefined
              }
            />
          ))}
          <Row icon="➕" title={t('parent.settings.inviteChild')} chevron onPress={() => setInvite('child')} />
          <Row icon="👪" title={t('parent.settings.inviteParent')} chevron onPress={() => setInvite('parent')} />
        </Group>

        <SectionLabel>{t('common.language')}</SectionLabel>
        <View style={styles.wrap}>
          {LANGS.map((l) => (
            <Chip key={l.code} label={l.label} selected={getLang() === l.code} onPress={() => changeLang(l.code)} />
          ))}
        </View>
        <Txt v="sub" color={p.muted} style={{ marginTop: 8, marginLeft: 6 }}>
          {t('parent.settings.langHint')}
        </Txt>
        <Group style={{ marginTop: 10 }}>
          <Row icon="🌍" title={t('common.country')} right={<Txt v="callout" color={p.muted}>{countryName}</Txt>} />
        </Group>

        <SectionLabel>{t('parent.settings.notifications')}</SectionLabel>
        <Group>
          {me.telegram.linked ? (
            <Row
              icon="✈️"
              title={t('parent.settings.tgLinked')}
              subtitle={t('parent.settings.tgLinkedSub')}
              right={
                <Pressable hitSlop={8} onPress={disconnectTelegram}>
                  <Txt v="sub" color={p.bad}>
                    {t('parent.settings.disconnect')}
                  </Txt>
                </Pressable>
              }
            />
          ) : (
            <Row
              icon="✈️"
              title={t('parent.settings.tgGet')}
              subtitle={me.telegram.enabled ? t('parent.settings.tgSub') : t('parent.settings.tgOff')}
              disabled={!me.telegram.enabled || tgBusy}
              chevron={me.telegram.enabled}
              onPress={connectTelegram}
            />
          )}
          <Row icon="🔔" title={t('parent.settings.push')} subtitle={t('parent.settings.pushSub')} disabled />
        </Group>

        <SectionLabel>{t('parent.settings.photos')}</SectionLabel>
        <Group>
          <Row
            icon="🗂️"
            title={t('parent.settings.keepPhotos')}
            subtitle={tn('parent.settings.keepSub', f.photo_retention_days)}
            right={<DaysStepper value={f.photo_retention_days} onChange={(v) => patch({ photo_retention_days: v })} />}
          />
        </Group>

        <SectionLabel>{t('parent.settings.subscription')}</SectionLabel>
        <Group>
          <Row
            icon="⭐"
            title={subTitle}
            subtitle={t('parent.settings.familyCode', { code: f.code })}
            // store subscriptions are changed or cancelled in the store's own settings
            chevron={!!a.store}
            onPress={a.store ? () => openManage() : undefined}
          />
        </Group>

        <SectionLabel>{t('parent.settings.docs')}</SectionLabel>
        <Group>
          <Row icon="📄" title={t('parent.settings.terms')} chevron onPress={() => Linking.openURL(legalUrl('terms', getLang()))} />
          <Row icon="🔒" title={t('parent.settings.privacy')} chevron onPress={() => Linking.openURL(legalUrl('privacy', getLang()))} />
        </Group>

        <SectionLabel>{t('parent.settings.account')}</SectionLabel>
        <Group>
          <Row icon="🚪" title={t('parent.settings.logoutRow')} danger onPress={logout} />
          <Row icon="🗑️" title={t('parent.settings.deleteRow')} danger onPress={deleteAll} />
        </Group>
        <Txt v="sub" color={p.muted} style={{ textAlign: 'center', marginTop: 20 }}>
          {t('parent.settings.version', { v: '1.0' })}
        </Txt>
      </Screen>

      <Sheet visible={nameEdit !== null} title={t('parent.settings.childName')} onClose={() => setNameEdit(null)}>
        <Field value={nameEdit ?? ''} onChangeText={setNameEdit} maxLength={30} autoFocus />
        <Btn
          title={t('common.save')}
          disabled={!nameEdit?.trim()}
          onPress={() => {
            patch({ child_name: nameEdit!.trim() }, t('parent.settings.saved'));
            setNameEdit(null);
          }}
        />
      </Sheet>
      <Sheet visible={newTime !== null} title={t('parent.settings.newReminder')} onClose={() => setNewTime(null)}>
        <View style={{ alignItems: 'center', marginVertical: 10 }}>
          <TimeStepper value={newTime ?? '16:00'} onChange={setNewTime} />
        </View>
        <Txt v="sub" color={p.muted} style={{ textAlign: 'center', marginBottom: 14 }}>
          {t('parent.settings.reminderHint')}
        </Txt>
        <Btn
          title={t('common.add')}
          onPress={() => {
            if (newTime && !f.remind_times.includes(newTime)) patch({ remind_times: [...f.remind_times, newTime].sort() }, t('parent.settings.reminderAdded'));
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
  const t = useT();
  const set = (v: number) => onChange(Math.min(40, Math.max(7, v)));
  const btn = (d: number, label: string) => (
    <Pressable
      hitSlop={6}
      onPress={() => set(value + d)}
      onLongPress={() => set(value + d * 7)}
      disabled={(d < 0 && value <= 7) || (d > 0 && value >= 40)}
      accessibilityLabel={d < 0 ? t('parent.settings.fewerDays') : t('parent.settings.moreDays')}
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
