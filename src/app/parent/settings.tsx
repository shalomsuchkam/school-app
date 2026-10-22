import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, Modal, Pressable, StyleSheet, View } from 'react-native';

import { AppearancePicker } from '@/components/AppearancePicker';
import { InviteSheet } from '@/components/InviteSheet';
import { Paywall } from '@/components/Paywall';
import { PhoneLimitGuide } from '@/components/PhoneLimitGuide';
import { Btn, Chip, Field, Group, Icon, Loading, Row, Screen, SectionLabel, Segmented, Sheet, TimeStepper, ToggleRow, Txt, useToast, WeekdayPicker } from '@/components/ui';
import { billingAvailable, openManage } from '@/lib/billing';
import { api, ApiError, legalUrl, type Child, type Me, type Role } from '@/lib/api';
import { useAuth, useIsViewer } from '@/lib/auth';
import { lastSeen, shortDate, toMin } from '@/lib/format';
import { getLang, LANGS, setLang, tn, useT, type Lang } from '@/lib/i18n';
import { usePalette } from '@/lib/theme';

export default function Settings() {
  const p = usePalette();
  const { signOut } = useAuth();
  const t = useT();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [childEdit, setChildEdit] = useState<{ id: number; name: string } | null>(null);
  const [newChild, setNewChild] = useState<string | null>(null);
  const [childBusy, setChildBusy] = useState(false);
  // several children: first ask which child the invite code is for
  const [invitePick, setInvitePick] = useState(false);
  const [inviteChild, setInviteChild] = useState<Child | null>(null);
  const [newTime, setNewTime] = useState<string | null>(null);
  const [invite, setInvite] = useState<Role | null>(null);
  const [tgBusy, setTgBusy] = useState(false);
  const [rewardEdit, setRewardEdit] = useState<string | null>(null);
  const [guide, setGuide] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const toast = useToast();
  const viewer = useIsViewer();

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
  if (viewer) return <ViewerSettings me={me} />;
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

  const rewardOn = f.reward_goal !== null;
  const toggleReward = (on: boolean) =>
    patch(on ? { reward_goal: 10, reward_text: f.reward_text || t('parent.settings.rewardDefault') } : { reward_goal: null });

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
  // no store subscription yet (trial, gift or lapsed): subscribing is possible before access runs out
  const canSubscribe = a.billing && !a.free_forever && !a.store && billingAvailable();

  const changeLang = (l: Lang) => {
    if (l === getLang()) return;
    setLang(l);
    patch({ lang: l });
  };
  const countryKey = `parent.country.${f.country}`;
  const countryName = t(countryKey) === countryKey ? f.country : t(countryKey);

  const parents = me.members.filter((m) => m.role === 'parent');
  const children = me.members.filter((m) => m.role === 'child');
  const viewers = me.members.filter((m) => m.role === 'viewer');
  const roleName = (r: Role) => t(r === 'parent' ? 'parent.settings.parent' : r === 'viewer' ? 'parent.settings.viewer' : 'parent.settings.student');

  // quiet hours: both ends together or none (the window may cross midnight)
  const quietOn = !!(f.quiet_from && f.quiet_to);
  const setQuiet = (from: string, to: string) => (from === to ? toast.show(t('parent.quiet.same')) : patch({ quiet_from: from, quiet_to: to }));
  const toggleViewers = (on: boolean) => {
    if (on || !viewers.length) return patch({ allow_viewers: on });
    Alert.alert(t('parent.viewers.offTitle'), t('parent.viewers.offMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('parent.viewers.off'), style: 'destructive', onPress: () => patch({ allow_viewers: false }).then(load) },
    ]);
  };
  const kids = me.children;
  const kidName = (id: number | null) => (id ? kids.find((c) => c.id === id)?.name : undefined);

  const renameChild = async () => {
    if (!childEdit?.name.trim()) return;
    setChildBusy(true);
    try {
      await api.renameChild(childEdit.id, childEdit.name.trim());
      setChildEdit(null);
      toast.show(t('parent.settings.saved'));
      load();
    } catch (e) {
      toast.show((e as Error).message);
    } finally {
      setChildBusy(false);
    }
  };
  const addChild = async () => {
    if (!newChild?.trim()) return;
    setChildBusy(true);
    try {
      await api.addChild(newChild.trim());
      setNewChild(null);
      toast.show(t('parent.settings.childAdded'));
      load();
    } catch (e) {
      toast.show((e as Error).message);
    } finally {
      setChildBusy(false);
    }
  };
  // the server keeps at least one child and explains why when asked to remove the last one
  const removeChild = (c: Child) =>
    Alert.alert(t('parent.settings.removeChildTitle', { name: c.name }), t('parent.settings.removeChildMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () =>
          api
            .removeChild(c.id)
            .then(
              () => toast.show(t('parent.settings.childRemoved')),
              (e: Error) => Alert.alert(e.message),
            )
            .finally(load),
      },
    ]);
  const openInviteChild = () => {
    if (kids.length < 2) {
      setInviteChild(null);
      return setInvite('child');
    }
    setInvitePick(true);
  };
  const pickInviteChild = (c: Child) => {
    setInvitePick(false);
    // two Modals swapped in one update never present the second on iOS: open the code sheet once this one has slid away
    setTimeout(() => {
      setInviteChild(c);
      setInvite('child');
    }, 350);
  };

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
        <SectionLabel>{t('parent.settings.students')}</SectionLabel>
        <Group>
          {kids.map((c) => (
            <Row
              key={c.id}
              icon="person" tint="blue"
              title={c.name}
              subtitle={kids.length > 1 ? t('parent.settings.renameSub') : t('parent.settings.nameSub')}
              onPress={() => setChildEdit({ id: c.id, name: c.name })}
              right={
                kids.length > 1 ? (
                  <Pressable
                    hitSlop={8}
                    onPress={() => removeChild(c)}
                    accessibilityRole="button"
                    accessibilityLabel={t('parent.settings.removeChildA11y', { name: c.name })}
                    style={({ pressed }) => [styles.trash, { backgroundColor: pressed ? p.badSoft : p.fill }]}
                  >
                    <Icon name="trash-outline" size={17} color={p.bad} />
                  </Pressable>
                ) : undefined
              }
              chevron
            />
          ))}
          <Row icon="add" tint="green" title={t('parent.settings.addChild')} chevron onPress={() => setNewChild('')} />
        </Group>

        <SectionLabel>{t('parent.settings.schoolDays')}</SectionLabel>
        <WeekdayPicker value={f.school_weekdays} onChange={(w) => (w.length ? patch({ school_weekdays: w }) : toast.show(t('parent.needSchoolDay')))} />
        <Group style={{ marginTop: 12 }}>
          <ToggleRow icon="flag" tint="red" title={t('parent.settings.holidays')} subtitle={t('parent.settings.holidaysSub')} value={f.auto_holidays} onChange={(v) => patch({ auto_holidays: v })} />
        </Group>

        <SectionLabel>{t('parent.settings.deadlines')}</SectionLabel>
        <Group>
          <Row icon="alarm" tint="orange" title={t('parent.settings.soft')} subtitle={t('parent.settings.softSub')} right={<TimeStepper value={f.soft_deadline} onChange={setSoft} clamp />} />
          <Row icon="moon" tint="violet" title={t('parent.settings.hard')} subtitle={t('parent.settings.hardSub')} right={<TimeStepper value={f.hard_deadline} onChange={setHard} clamp />} />
          <ToggleRow icon="timer" tint="teal" title={t('parent.settings.trackTime')} subtitle={t('parent.settings.trackTimeSub')} value={f.track_time} onChange={(v) => patch({ track_time: v })} />
        </Group>

        <SectionLabel>{t('parent.quiet.section')}</SectionLabel>
        <Group>
          <ToggleRow
            icon="moon"
            tint="violet"
            title={t('parent.quiet.on')}
            subtitle={t('parent.quiet.onSub')}
            value={quietOn}
            onChange={(on) => patch(on ? { quiet_from: '21:30', quiet_to: '07:00' } : { quiet_from: null, quiet_to: null })}
          />
          {quietOn ? (
            <Row icon="volume-mute" tint="gray" title={t('parent.quiet.from')} right={<TimeStepper value={f.quiet_from!} onChange={(v) => setQuiet(v, f.quiet_to!)} />} />
          ) : null}
          {quietOn ? <Row icon="sunny" tint="orange" title={t('parent.quiet.to')} right={<TimeStepper value={f.quiet_to!} onChange={(v) => setQuiet(f.quiet_from!, v)} />} /> : null}
        </Group>
        {quietOn ? (
          <Txt v="sub" color={p.muted} style={{ marginTop: 8, marginHorizontal: 6 }}>
            {t('parent.quiet.hint')}
          </Txt>
        ) : null}

        <SectionLabel>{t('parent.settings.reward')}</SectionLabel>
        <Group>
          <ToggleRow icon="trophy" tint="orange" title={t('parent.settings.rewardOn')} subtitle={t('parent.settings.rewardOnSub')} value={rewardOn} onChange={toggleReward} />
          {rewardOn ? (
            <Row
              icon="locate" tint="red"
              title={t('parent.settings.rewardGoal')}
              subtitle={tn('parent.settings.rewardGoalSub', f.reward_goal ?? 10)}
              right={<DaysStepper value={f.reward_goal ?? 10} min={1} max={60} onChange={(v) => patch({ reward_goal: v })} />}
            />
          ) : null}
          {rewardOn ? <Row icon="gift" tint="violet" title={t('parent.settings.rewardText')} subtitle={f.reward_text || t('parent.settings.rewardTextPh')} chevron onPress={() => setRewardEdit(f.reward_text ?? '')} /> : null}
        </Group>

        <SectionLabel>{t('parent.settings.phone')}</SectionLabel>
        <Group>
          <Row icon="phone-portrait" tint="gray" title={t('parent.settings.phoneRow')} subtitle={t('parent.settings.phoneSub')} chevron onPress={() => setGuide(true)} />
        </Group>

        <SectionLabel right={<Btn small kind="ghost" title={t('parent.settings.time')} icon="add" onPress={() => setNewTime('16:00')} />}>{t('parent.settings.reminders')}</SectionLabel>
        <View style={styles.wrap}>
          {f.remind_times.length ? (
            f.remind_times.map((hm) => (
              <Chip key={hm} label={hm} icon="alarm-outline" trailingIcon="close" onPress={() => patch({ remind_times: f.remind_times.filter((x) => x !== hm) })} />
            ))
          ) : (
            <Txt v="callout" color={p.muted} style={{ marginLeft: 6 }}>
              {t('parent.settings.onlyBefore')}
            </Txt>
          )}
        </View>

        <SectionLabel>{t('parent.settings.family')}</SectionLabel>
        <Group>
          {[...parents, ...children, ...viewers].map((m) => {
            const seen = m.me ? null : lastSeen(m.last_seen);
            return (
            <Row
              key={m.id}
              icon={m.role === 'parent' ? 'person-circle' : m.role === 'viewer' ? 'eye' : 'school'}
              tint={m.role === 'parent' ? 'gray' : m.role === 'viewer' ? 'teal' : 'blue'}
              title={`${m.name || roleName(m.role)}${m.me ? t('parent.settings.you') : ''}`}
              subtitle={`${roleName(m.role)}${m.role === 'child' && kids.length > 1 && kidName(m.child_id) ? ` · ${kidName(m.child_id)}` : ''}${m.telegram ? ' · Telegram' : ''}${seen ? ` · ${seen.text}` : ''}`}
              right={
                !m.me ? (
                  <Pressable hitSlop={12} accessibilityRole="button" onPress={() => removeMember(m.id, m.name || t('parent.settings.device'))}>
                    <Txt v="sub" color={p.bad} style={{ fontWeight: '600' }}>
                      {t('parent.settings.disconnect')}
                    </Txt>
                  </Pressable>
                ) : undefined
              }
            />
            );
          })}
          <Row icon="person-add" tint="green" title={t('parent.settings.inviteChild')} chevron onPress={openInviteChild} />
          <Row icon="people" tint="green" title={t('parent.settings.inviteParent')} chevron onPress={() => setInvite('parent')} />
        </Group>

        <SectionLabel>{t('parent.viewers.section')}</SectionLabel>
        <Group>
          <ToggleRow icon="eye" tint="teal" title={t('parent.viewers.allow')} subtitle={t('parent.viewers.allowSub')} value={!!f.allow_viewers} onChange={toggleViewers} />
          {f.allow_viewers ? <Row icon="person-add" tint="teal" title={t('parent.viewers.invite')} chevron onPress={() => setInvite('viewer')} /> : null}
        </Group>

        <SectionLabel>{t('screen.section')}</SectionLabel>
        <Group>
          <Row icon="hourglass" tint="violet" title={t('screen.row')} subtitle={t('screen.rowSub')} chevron onPress={() => router.push('/parent/screen')} />
        </Group>

        <SectionLabel>{t('parent.bc.section')}</SectionLabel>
        <Group>
          <Row icon="cloud-download" tint="blue" title={t('parent.bc.row')} subtitle={t('parent.bc.rowSub')} chevron onPress={() => router.push('/parent/bilimclass')} />
        </Group>

        <SectionLabel>{t('common.language')}</SectionLabel>
        <Segmented value={getLang()} onChange={changeLang} options={LANGS.map((l) => ({ value: l.code, label: l.label }))} />
        <Txt v="sub" color={p.muted} style={{ marginTop: 8, marginLeft: 6 }}>
          {t('parent.settings.langHint')}
        </Txt>
        <Group style={{ marginTop: 10 }}>
          <Row icon="globe" tint="teal" title={t('common.country')} value={countryName} />
        </Group>

        <SectionLabel>{t('common.theme.section')}</SectionLabel>
        <AppearancePicker />

        <SectionLabel>{t('parent.settings.notifications')}</SectionLabel>
        <Group>
          {me.telegram.linked ? (
            <Row
              icon="paper-plane"
              tint="blue"
              title={t('parent.settings.tgLinked')}
              subtitle={t('parent.settings.tgLinkedSub')}
              right={
                <Pressable hitSlop={12} accessibilityRole="button" onPress={disconnectTelegram}>
                  <Txt v="sub" color={p.bad} style={{ fontWeight: '600' }}>
                    {t('parent.settings.disconnect')}
                  </Txt>
                </Pressable>
              }
            />
          ) : (
            <Row
              icon="paper-plane"
              tint="blue"
              title={t('parent.settings.tgGet')}
              subtitle={me.telegram.enabled ? t('parent.settings.tgSub') : t('parent.settings.tgOff')}
              disabled={!me.telegram.enabled || tgBusy}
              chevron={me.telegram.enabled}
              onPress={connectTelegram}
            />
          )}
          <Row icon="notifications" tint="red" title={t('parent.settings.push')} subtitle={t('parent.settings.pushSub')} disabled />
        </Group>

        <SectionLabel>{t('parent.settings.photos')}</SectionLabel>
        <Group>
          <Row
            icon="images"
            tint="teal"
            title={t('parent.settings.keepPhotos')}
            subtitle={tn('parent.settings.keepSub', f.photo_retention_days)}
            right={<DaysStepper value={f.photo_retention_days} min={7} max={40} week onChange={(v) => patch({ photo_retention_days: v })} />}
          />
        </Group>

        <SectionLabel>{t('parent.settings.subscription')}</SectionLabel>
        <Group>
          <Row
            icon="star"
            tint="orange"
            title={subTitle}
            subtitle={t('parent.settings.familyCode', { code: f.code })}
            // store subscriptions are changed or cancelled in the store's own settings
            chevron={!!a.store}
            onPress={a.store ? () => openManage() : undefined}
          />
          {canSubscribe ? <Row icon="card" tint="green" title={t('parent.settings.subscribe')} chevron onPress={() => setPaywall(true)} /> : null}
        </Group>

        <SectionLabel>{t('parent.settings.docs')}</SectionLabel>
        <Group>
          <Row icon="document-text" tint="gray" title={t('parent.settings.terms')} chevron onPress={() => Linking.openURL(legalUrl('terms', getLang()))} />
          <Row icon="lock-closed" tint="gray" title={t('parent.settings.privacy')} chevron onPress={() => Linking.openURL(legalUrl('privacy', getLang()))} />
        </Group>

        <SectionLabel>{t('parent.settings.account')}</SectionLabel>
        <Group>
          <Row icon="log-out-outline" title={t('parent.settings.logoutRow')} danger onPress={logout} />
          <Row icon="trash-outline" title={t('parent.settings.deleteRow')} danger onPress={deleteAll} />
        </Group>
        <Txt v="sub" color={p.muted} style={{ textAlign: 'center', marginTop: 20 }}>
          {t('parent.settings.version', { v: '1.0' })}
        </Txt>
      </Screen>

      <Sheet visible={childEdit !== null} title={t('parent.settings.childName')} onClose={() => setChildEdit(null)} overlay={childEdit ? toast.node : null}>
        <Field value={childEdit?.name ?? ''} onChangeText={(name) => childEdit && setChildEdit({ ...childEdit, name })} maxLength={30} autoFocus />
        <Btn title={t('common.save')} disabled={!childEdit?.name.trim()} loading={childBusy} onPress={renameChild} />
      </Sheet>
      <Sheet visible={newChild !== null} title={t('parent.settings.addChildTitle')} onClose={() => setNewChild(null)} overlay={newChild !== null ? toast.node : null}>
        <Field value={newChild ?? ''} onChangeText={setNewChild} placeholder={t('parent.settings.childNamePh')} maxLength={30} autoFocus onSubmitEditing={addChild} />
        <Btn title={t('common.add')} disabled={!newChild?.trim()} loading={childBusy} onPress={addChild} />
      </Sheet>
      <Sheet visible={invitePick} title={t('parent.settings.inviteChild')} onClose={() => setInvitePick(false)}>
        <Txt v="callout" color={p.muted} style={{ marginBottom: 12 }}>
          {t('parent.settings.inviteWho')}
        </Txt>
        <View style={styles.wrap}>
          {kids.map((c) => (
            <Chip key={c.id} label={c.name} onPress={() => pickInviteChild(c)} />
          ))}
        </View>
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
      <Sheet visible={rewardEdit !== null} title={t('parent.settings.rewardEdit')} onClose={() => setRewardEdit(null)}>
        <Field value={rewardEdit ?? ''} onChangeText={setRewardEdit} placeholder={t('parent.settings.rewardTextPh')} maxLength={80} autoFocus />
        <Btn
          title={t('common.save')}
          disabled={!rewardEdit?.trim()}
          onPress={() => {
            patch({ reward_text: rewardEdit!.trim() }, t('parent.settings.saved'));
            setRewardEdit(null);
          }}
        />
      </Sheet>
      <Modal visible={paywall} animationType="slide" onRequestClose={() => setPaywall(false)}>
        <Paywall
          role="parent"
          onClose={() => setPaywall(false)}
          onActive={() => {
            setPaywall(false);
            load();
          }}
        />
      </Modal>
      <PhoneLimitGuide visible={guide} onClose={() => setGuide(false)} />
      <InviteSheet
        role={invite}
        childId={invite === 'child' ? inviteChild?.id : undefined}
        childName={invite === 'child' ? inviteChild?.name : undefined}
        onClose={() => setInvite(null)}
      />
      {childEdit !== null || newChild !== null ? null : toast.node}
    </>
  );
}

// A tutor / teacher device: language, appearance and leaving the family; nothing about the family itself.
function ViewerSettings({ me }: { me: Me }) {
  const p = usePalette();
  const t = useT();
  const { signOut } = useAuth();
  const leave = () =>
    Alert.alert(t('parent.viewerMode.leaveTitle'), t('parent.viewerMode.leaveMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('parent.viewerMode.leave'),
        style: 'destructive',
        onPress: async () => {
          await api.leave().catch(() => {});
          await signOut();
          router.replace('/welcome');
        },
      },
    ]);
  return (
    <Screen title={t('parent.tab.settings')}>
      <Group>
        <Row icon="eye" tint="teal" title={me.device.name || t('parent.settings.viewer')} subtitle={t('parent.viewerMode.text')} />
      </Group>
      <SectionLabel>{t('common.language')}</SectionLabel>
      <Segmented value={getLang()} onChange={(l: Lang) => setLang(l)} options={LANGS.map((l) => ({ value: l.code, label: l.label }))} />
      <SectionLabel>{t('common.theme.section')}</SectionLabel>
      <AppearancePicker />
      <SectionLabel>{t('parent.settings.account')}</SectionLabel>
      <Group>
        <Row icon="log-out-outline" title={t('parent.viewerMode.leave')} danger onPress={leave} />
      </Group>
      <Txt v="sub" color={p.muted} style={{ textAlign: 'center', marginTop: 20 }}>
        {t('parent.settings.version', { v: '1.0' })}
      </Txt>
    </Screen>
  );
}

// min–max days in steps of one day (long press jumps by a week, or by 5 for counts)
function DaysStepper({ value, onChange, min, max, week }: { value: number; onChange: (v: number) => void; min: number; max: number; week?: boolean }) {
  const p = usePalette();
  const t = useT();
  const set = (v: number) => {
    const next = Math.min(max, Math.max(min, v));
    if (next !== value) onChange(next);
  };
  const btn = (d: number, icon: 'remove' | 'add') => (
    <Pressable
      hitSlop={6}
      onPress={() => set(value + d)}
      onLongPress={() => set(value + d * (week ? 7 : 5))}
      disabled={(d < 0 && value <= min) || (d > 0 && value >= max)}
      accessibilityRole="button"
      accessibilityLabel={week ? t(d < 0 ? 'parent.settings.fewerDays' : 'parent.settings.moreDays') : t(d < 0 ? 'parent.settings.fewer' : 'parent.settings.more')}
      style={({ pressed }) => [styles.step, { backgroundColor: p.fill, opacity: (d < 0 && value <= min) || (d > 0 && value >= max) ? 0.4 : 1, transform: [{ scale: pressed ? 0.9 : 1 }] }]}
    >
      <Icon name={icon} size={18} color={p.ink2} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {btn(-1, 'remove')}
      <Txt v="headline" style={{ minWidth: 28, textAlign: 'center', fontVariant: ['tabular-nums'] }}>
        {value}
      </Txt>
      {btn(1, 'add')}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  trash: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  step: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
