import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppPicker, MinutesPicker } from '@/components/screen/AppPicker';
import { GuardCard } from '@/components/screen/GuardCard';
import { TextbookLinks } from '@/components/screen/TextbookLinks';
import { Banner, Btn, Card, Chip, ErrorBanner, Group, IconBtn, Loading, Row, Screen, SectionLabel, Sheet, TimeStepper, ToggleRow, Txt, useToast, WeekdayPicker } from '@/components/ui';
import { api, isPaywall, type Child, type ScreenPatch, type ScreenRules, type ScreenState } from '@/lib/api';
import { useIsViewer } from '@/lib/auth';
import { ChildSwitcher, currentChildReady, getCurrentChild, setCurrentChild, useCurrentChild } from '@/lib/currentChild';
import { duration } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { appName, countedUsage, hmIn, unlockActive, usageOf, withPkg } from '@/lib/screenTime';
import { space, usePalette } from '@/lib/theme';

type Target = 'limit' | 'blocked' | 'allowed' | 'bedtime' | 'school';
const SELF = 'kz.uroki.app';

// Parent: screen time for one child (docs/SCREEN_TIME.md). Every change is a partial PUT; the child's phone
// picks it up within minutes (or at once when «Уроки» is open there).
export default function ScreenTime() {
  const p = usePalette();
  const t = useT();
  const toast = useToast();
  const viewer = useIsViewer();
  const [kids, setKids] = useState<Child[]>([]);
  const [childId] = useCurrentChild(kids);
  const [st, setSt] = useState<ScreenState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paywall, setPaywall] = useState(false);
  const [picker, setPicker] = useState<Target | null>(null);
  const [approveLimit, setApproveLimit] = useState<string | null>(null);
  const [approveMins, setApproveMins] = useState(60);
  const [busy, setBusy] = useState<string | null>(null);
  const limitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const cid = await currentChildReady();
      const me = await api.me();
      setKids(me.children);
      try {
        const s = await api.getScreenRules(cid ?? undefined);
        if (getCurrentChild() !== cid) return;
        setSt(s);
        setPaywall(false);
      } catch (e) {
        if (!isPaywall(e)) throw e;
        setPaywall(true);
      }
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

  if (viewer) return <Redirect href="/parent" />;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/parent/settings'));
  const close = <IconBtn icon="close" label={t('common.close')} onPress={back} />;
  if (paywall && !st) {
    return (
      <Screen title={t('screen.title')} right={close} footer={toast.node}>
        <Banner tone="warn" icon="lock-closed-outline" title={t('screen.paywall.title')} text={t('screen.paywall.text')} />
        <TextbookLinks kids={kids} childId={childId} onToast={toast.show} />
      </Screen>
    );
  }
  if (!st) return <Loading error={error} onRetry={load} />;

  const r = st.rules;
  const cid = r.child_id;
  const usage = usageOf(st);
  const apps = (st.device?.apps ?? []).filter((a) => a.pkg !== SELF);
  const name = (pkg: string) => appName(st, pkg);
  const usedLine = (pkg: string) => (usage.apps[pkg] ? t('screen.usage.today', { dur: duration(usage.apps[pkg]) }) : undefined);

  const applyRules = (rules: ScreenRules) => setSt((cur) => (cur && cur.rules.child_id === rules.child_id ? { ...cur, rules } : cur));
  const save = async (patch: Omit<ScreenPatch, 'child_id'>) => {
    setSt((cur) => (cur ? { ...cur, rules: { ...cur.rules, ...patch } } : cur));
    try {
      applyRules(await api.putScreenRules({ child_id: cid, ...patch }));
    } catch (e) {
      toast.show((e as Error).message);
      load();
    }
  };
  // the stepper sends one request after the parent stops tapping
  const saveLimit = (m: number) => {
    setSt((cur) => (cur ? { ...cur, rules: { ...cur.rules, daily_limit_min: m } } : cur));
    if (limitTimer.current) clearTimeout(limitTimer.current);
    limitTimer.current = setTimeout(() => save({ daily_limit_min: m }), 700);
  };
  const switchChild = (id: number | null) => {
    if (id === null || id === cid) return;
    setCurrentChild(id);
    setSt(null);
    load();
  };

  const pick = (target: Target, pkg: string, appLabel: string, minutes?: number) => {
    setPicker(null);
    if (target === 'limit' && minutes) {
      return save({
        app_limits: [...r.app_limits.filter((l) => l.pkg !== pkg), { pkg, name: appLabel, minutes }],
        blocked_apps: withPkg(r.blocked_apps, pkg, false),
        always_allowed: withPkg(r.always_allowed, pkg, false),
      });
    }
    if (target === 'blocked') return save({ blocked_apps: withPkg(r.blocked_apps, pkg, true), always_allowed: withPkg(r.always_allowed, pkg, false) });
    if (target === 'allowed') return save({ always_allowed: withPkg(r.always_allowed, pkg, true), blocked_apps: withPkg(r.blocked_apps, pkg, false) });
    if (target === 'bedtime' && r.bedtime) return save({ bedtime: { ...r.bedtime, allowed: withPkg(r.bedtime.allowed, pkg, true) } });
    if (target === 'school' && r.school) return save({ school: { ...r.school, allowed: withPkg(r.school.allowed, pkg, true) } });
  };
  const pickerExclude =
    picker === 'limit' ? r.app_limits.map((l) => l.pkg) : picker === 'blocked' ? r.blocked_apps : picker === 'allowed' ? r.always_allowed : picker === 'bedtime' ? (r.bedtime?.allowed ?? []) : (r.school?.allowed ?? []);

  const approve = async (pkg: string, action: 'allow' | 'block' | 'limit', minutes?: number) => {
    setBusy(pkg);
    try {
      applyRules(await api.screenApprove(cid, pkg, action, minutes));
      setSt((cur) => (cur ? { ...cur, new_apps: cur.new_apps.filter((x) => x !== pkg) } : cur));
      toast.show(t(`screen.new.done.${action}`, { app: name(pkg) }));
    } catch (e) {
      toast.show((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const unlock = async (minutes: number) => {
    setBusy('unlock');
    try {
      applyRules(await api.screenUnlock(cid, minutes));
      toast.show(minutes ? t('screen.bonus.given', { dur: duration(minutes) }) : t('screen.bonus.cancelled'));
    } catch (e) {
      toast.show((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const setWindowTime = (which: 'bedtime' | 'school', end: 'from' | 'to', v: string) => {
    const w = r[which];
    if (!w) return;
    if ((end === 'from' ? w.to : w.from) === v) return toast.show(t('screen.win.same'));
    save(which === 'bedtime' ? { bedtime: { ...w, [end]: v } } : { school: { ...(w as NonNullable<ScreenRules['school']>), [end]: v } });
  };

  const removeLink = (label: string, onPress: () => void) => (
    <Pressable hitSlop={12} accessibilityRole="button" accessibilityLabel={`${t('screen.remove')}: ${label}`} onPress={onPress}>
      <Txt v="sub" color={p.bad} style={{ fontWeight: '600' }}>
        {t('screen.remove')}
      </Txt>
    </Pressable>
  );
  const appRows = (list: string[], onRemove: (pkg: string) => void) =>
    list.map((pkg) => <Row key={pkg} icon="apps" title={name(pkg)} subtitle={usedLine(pkg)} right={removeLink(name(pkg), () => onRemove(pkg))} />);
  const addRow = (target: Target, label: string) => <Row key="add" icon="add" title={label} chevron onPress={() => setPicker(target)} />;
  const unlocked = unlockActive(r.unlock_until);

  return (
    <Screen title={t('screen.title')} subtitle={t('screen.subtitle')} right={close} onRefresh={load} footer={picker || approveLimit ? null : toast.node}>
      <ChildSwitcher list={kids} value={childId} onChange={switchChild} />
      <ErrorBanner error={error} onRetry={load} />

      <GuardCard device={st.device} enabled={r.enabled} usedToday={countedUsage(usage.total, usage.apps, r.always_allowed)} />

      <Group style={{ marginTop: space.s }}>
        <ToggleRow icon="hourglass" tint="blue" title={t('screen.enabled')} subtitle={t(r.enabled ? 'screen.enabledOn' : 'screen.enabledOff')} value={r.enabled} onChange={(v) => save({ enabled: v })} />
      </Group>
      {r.enabled ? null : (
        <Txt v="sub" color={p.muted} style={styles.hint}>
          {t('screen.intro')}
        </Txt>
      )}

      {st.new_apps.length ? (
        <>
          <SectionLabel>{t('screen.new.section')}</SectionLabel>
          {st.new_apps.map((pkg) => (
            <Card key={pkg} style={styles.newApp}>
              <Txt v="headline">{name(pkg)}</Txt>
              <Txt v="sub" color={p.muted}>
                {t('screen.new.hint')}
              </Txt>
              <View style={styles.btnRow}>
                <Btn small kind="ok" title={t('screen.new.allow')} loading={busy === pkg} onPress={() => approve(pkg, 'allow')} />
                <Btn small kind="secondary" title={t('screen.new.limit')} disabled={busy === pkg} 
                  onPress={() => {
                    setApproveMins(60);
                    setApproveLimit(pkg);
                  }}
                />
                <Btn small kind="plain" title={t('screen.new.block')} disabled={busy === pkg} onPress={() => approve(pkg, 'block')} />
              </View>
            </Card>
          ))}
        </>
      ) : null}

      <SectionLabel>{t('screen.bonus.section')}</SectionLabel>
      <Card style={{ gap: space.s }}>
        {unlocked && r.unlock_until ? (
          <>
            <Txt v="headline">{t('screen.bonus.until', { hm: hmIn(r.unlock_until, st.tz) })}</Txt>
            <Btn small kind="plain" icon="close" title={t('screen.bonus.cancel')} loading={busy === 'unlock'} onPress={() => unlock(0)} style={{ alignSelf: 'flex-start' }} />
          </>
        ) : (
          <>
            <Txt v="callout" color={p.ink2}>
              {t('screen.bonus.text')}
            </Txt>
            <View style={styles.btnRow}>
              {[15, 30, 60].map((m) => (
                <Chip key={m} icon="add" label={duration(m)} onPress={busy === 'unlock' ? undefined : () => unlock(m)} />
              ))}
            </View>
          </>
        )}
      </Card>

      <SectionLabel>{t('screen.daily.section')}</SectionLabel>
      <Group>
        <ToggleRow
          icon="time"
          tint="orange"
          title={t('screen.daily.toggle')}
          subtitle={r.daily_limit_min ? t('screen.daily.sub', { dur: duration(r.daily_limit_min) }) : t('screen.daily.off')}
          value={r.daily_limit_min != null}
          onChange={(v) => {
            if (limitTimer.current) clearTimeout(limitTimer.current);
            save({ daily_limit_min: v ? 120 : null });
          }}
        />
      </Group>
      {r.daily_limit_min != null ? (
        <Card style={{ marginTop: space.xs }}>
          <MinutesPicker value={r.daily_limit_min} onChange={saveLimit} />
        </Card>
      ) : null}

      <SectionLabel>{t('screen.limits.section')}</SectionLabel>
      <Group>
        {r.app_limits.map((l) => (
          <Row
            key={l.pkg}
            icon="apps"
            title={name(l.pkg)}
            subtitle={`${t('screen.limits.perDay', { dur: duration(l.minutes) })}${usage.apps[l.pkg] ? ` · ${t('screen.usage.today', { dur: duration(usage.apps[l.pkg]) })}` : ''}`}
            right={removeLink(name(l.pkg), () => save({ app_limits: r.app_limits.filter((x) => x.pkg !== l.pkg) }))}
          />
        ))}
        {addRow('limit', t('screen.limits.add'))}
      </Group>

      <SectionLabel>{t('screen.blocked.section')}</SectionLabel>
      <Group>
        {appRows(r.blocked_apps, (pkg) => save({ blocked_apps: withPkg(r.blocked_apps, pkg, false) }))}
        {addRow('blocked', t('screen.blocked.add'))}
      </Group>

      <SectionLabel>{t('screen.allowed.section')}</SectionLabel>
      <Group>
        {appRows(r.always_allowed, (pkg) => save({ always_allowed: withPkg(r.always_allowed, pkg, false) }))}
        {addRow('allowed', t('screen.allowed.add'))}
      </Group>
      <Txt v="sub" color={p.muted} style={styles.hint}>
        {t('screen.allowed.hint')}
      </Txt>

      <SectionLabel>{t('screen.bed.section')}</SectionLabel>
      <Group>
        <ToggleRow icon="moon" tint="violet" title={t('screen.bed.toggle')} subtitle={t('screen.bed.sub')} value={!!r.bedtime} onChange={(v) => save({ bedtime: v ? { from: '21:30', to: '07:00', allowed: [] } : null })} />
        {r.bedtime ? <Row title={t('screen.win.from')} right={<TimeStepper value={r.bedtime.from} onChange={(v) => setWindowTime('bedtime', 'from', v)} />} /> : null}
        {r.bedtime ? <Row title={t('screen.win.to')} right={<TimeStepper value={r.bedtime.to} onChange={(v) => setWindowTime('bedtime', 'to', v)} />} /> : null}
      </Group>
      {r.bedtime ? (
        <>
          <Txt v="sub" color={p.muted} style={styles.subLabel}>
            {t('screen.win.allowed')}
          </Txt>
          <Group>
            {appRows(r.bedtime.allowed, (pkg) => r.bedtime && save({ bedtime: { ...r.bedtime, allowed: withPkg(r.bedtime.allowed, pkg, false) } }))}
            {addRow('bedtime', t('screen.win.addAllowed'))}
          </Group>
        </>
      ) : null}

      <SectionLabel>{t('screen.school.section')}</SectionLabel>
      <Group>
        <ToggleRow
          icon="school"
          tint="teal"
          title={t('screen.school.toggle')}
          subtitle={t('screen.school.sub')}
          value={!!r.school}
          onChange={(v) => save({ school: v ? { from: '08:00', to: '14:00', days: [1, 2, 3, 4, 5], allowed: [] } : null })}
        />
        {r.school ? <Row title={t('screen.win.from')} right={<TimeStepper value={r.school.from} onChange={(v) => setWindowTime('school', 'from', v)} />} /> : null}
        {r.school ? <Row title={t('screen.win.to')} right={<TimeStepper value={r.school.to} onChange={(v) => setWindowTime('school', 'to', v)} />} /> : null}
      </Group>
      {r.school ? (
        <>
          <Txt v="sub" color={p.muted} style={styles.subLabel}>
            {t('screen.school.days')}
          </Txt>
          <WeekdayPicker value={r.school.days} onChange={(days) => r.school && (days.length ? save({ school: { ...r.school, days } }) : toast.show(t('screen.school.oneDay')))} />
          <Txt v="sub" color={p.muted} style={styles.subLabel}>
            {t('screen.win.allowed')}
          </Txt>
          <Group>
            {appRows(r.school.allowed, (pkg) => r.school && save({ school: { ...r.school, allowed: withPkg(r.school.allowed, pkg, false) } }))}
            {addRow('school', t('screen.win.addAllowed'))}
          </Group>
        </>
      ) : null}

      <SectionLabel>{t('screen.more.section')}</SectionLabel>
      <Group>
        <ToggleRow icon="book" tint="green" title={t('screen.hw.toggle')} subtitle={t('screen.hw.sub')} value={r.homework_lock} onChange={(v) => save({ homework_lock: v })} />
        {r.homework_lock ? <Row title={t('screen.hw.from')} right={<TimeStepper value={r.homework_lock_from} onChange={(v) => save({ homework_lock_from: v })} />} /> : null}
        <ToggleRow icon="download" tint="red" title={t('screen.newApps.toggle')} subtitle={t('screen.newApps.sub')} value={r.block_new_apps} onChange={(v) => save({ block_new_apps: v })} />
      </Group>
      {r.homework_lock ? (
        <Txt v="sub" color={p.muted} style={styles.hint}>
          {st.homework_done ? t('screen.hw.doneNow') : t('screen.hw.notDone')}
        </Txt>
      ) : null}

      <TextbookLinks kids={kids} childId={childId} onToast={toast.show} />

      <AppPicker
        visible={picker !== null}
        title={picker === 'limit' ? t('screen.limits.add') : picker === 'blocked' ? t('screen.blocked.add') : picker === 'allowed' ? t('screen.allowed.add') : t('screen.win.addAllowed')}
        apps={apps}
        usage={usage.apps}
        exclude={pickerExclude}
        minutes={picker === 'limit'}
        onClose={() => setPicker(null)}
        onPick={(a, m) => picker && pick(picker, a.pkg, a.name, m)}
      />
      <Sheet visible={approveLimit !== null} title={approveLimit ? name(approveLimit) : ''} onClose={() => setApproveLimit(null)}>
        <View style={{ gap: space.m }}>
          <Txt v="callout" color={p.muted}>
            {t('screen.limit.ask')}
          </Txt>
          <MinutesPicker value={approveMins} onChange={setApproveMins} />
          <Btn
            title={t('common.save')}
            onPress={() => {
              const pkg = approveLimit;
              setApproveLimit(null);
              if (pkg) approve(pkg, 'limit', approveMins);
            }}
          />
          <View style={{ height: space.s }} />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: { marginTop: space.xs, marginHorizontal: 6 },
  subLabel: { marginTop: space.s, marginBottom: space.xs, marginHorizontal: 6, fontWeight: '600' },
  newApp: { gap: space.xs, marginBottom: space.xs },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
});
