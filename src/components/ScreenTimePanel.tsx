import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';

import { IosSetupCard } from '@/components/screen/IosScreenTime';
import { Btn, Card, Icon, IconTile, ProgressBar, Txt } from '@/components/ui';
import { api, API_BASE, getToken, isPaywall, type ScreenState } from '@/lib/api';
import { duration } from '@/lib/format';
import { useT } from '@/lib/i18n';
import {
  guardReady,
  guardStatus,
  openBatterySettings,
  openOverlaySettings,
  openUsageAccessSettings,
  setGuardRules,
  startGuard,
  stopGuard,
  usageToday,
  type GuardStatus,
  type UsageToday,
} from '@/lib/screenGuard';
import { applyIos, iosScreenTimeOn } from '@/lib/screenGuardIos';
import { addUsage, appName, countedUsage, hmIn, otherUsageOf, remaining, unlockActive } from '@/lib/screenTime';
import { space, usePalette } from '@/lib/theme';

const POLL_MS = 30_000;

// Child home: screen time. Fetches the parent's rules, hands them to the Android guard (or, in iOS builds with the
// iosScreenTime flag, to Apple's Screen Time: lib/screenGuardIos), turns the guard off when the rules are off (or the
// subscription lapsed: a lapsed payment must never lock the phone), and shows either the setup steps or today's usage.
export function ScreenTimePanel() {
  const p = usePalette();
  const t = useT();
  const [st, setSt] = useState<ScreenState | null>(null);
  const [g, setG] = useState<GuardStatus | null>(null);
  const [usage, setUsage] = useState<UsageToday | null>(null);
  const [starting, setStarting] = useState(false);
  const [failed, setFailed] = useState(false);
  const refreshing = useRef(false);

  const start = useCallback(async (s: ScreenState) => {
    const token = getToken();
    if (!token) return false;
    const ok = await startGuard({ apiBase: API_BASE, token, childId: String(s.rules.child_id) });
    await setGuardRules(s as unknown as Record<string, unknown>);
    setG(await guardStatus());
    return ok;
  }, []);

  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const status = await guardStatus();
      setG(status);
      let s: ScreenState;
      try {
        s = await api.getScreenRules();
      } catch (e) {
        if (isPaywall(e)) {
          setSt(null);
          if (iosScreenTimeOn) await applyIos(null);
          if (status.running) {
            await stopGuard();
            setG(await guardStatus());
          }
        }
        return; // offline: the guard keeps its last rules and polls by itself
      }
      setSt(s);
      // iOS: recompute shields and schedules on every fetch and foreground (clears everything when the rules are off)
      if (iosScreenTimeOn) await applyIos(s);
      if (!status.supported) return;
      await setGuardRules(s as unknown as Record<string, unknown>);
      if (!s.rules.enabled) {
        if (status.running) {
          await stopGuard();
          setG(await guardStatus());
        }
        return;
      }
      // set up before (e.g. stopped while the subscription lapsed): start again without asking
      if (guardReady(status) && !status.running && status.configured) await start(s);
      setUsage(await usageToday());
    } finally {
      refreshing.current = false;
    }
  }, [start]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );
  useEffect(() => {
    // back from the system settings: the step statuses update right away
    const sub = AppState.addEventListener('change', (a) => a === 'active' && refresh());
    const poll = setInterval(refresh, POLL_MS);
    return () => {
      sub.remove();
      clearInterval(poll);
    };
  }, [refresh]);

  if (!st || !st.rules.enabled || !g) return null;
  const r = st.rules;

  if (!g.supported) {
    if (Platform.OS !== 'ios') return null;
    if (iosScreenTimeOn) return <IosSetupCard onChange={refresh} />;
    return (
      <Card style={styles.card}>
        <View style={styles.head}>
          <IconTile icon="hourglass-outline" size={40} />
          <Txt v="headline" style={{ flex: 1 }}>
            {t('screen.child.title')}
          </Txt>
        </View>
        <Txt v="callout" color={p.ink2}>
          {t('screen.child.ios')}
        </Txt>
      </Card>
    );
  }

  if (!guardReady(g) || !g.running) {
    const steps = [
      { done: g.usage_access, title: t('screen.setup.usage'), text: t('screen.setup.usageText'), open: openUsageAccessSettings },
      { done: g.overlay, title: t('screen.setup.overlay'), text: t('screen.setup.overlayText'), open: openOverlaySettings },
      { done: g.battery_ok, title: t('screen.setup.battery'), text: t('screen.setup.batteryText'), open: openBatterySettings },
    ];
    const turnOn = async () => {
      setStarting(true);
      setFailed(!(await start(st)));
      setStarting(false);
    };
    return (
      <Card style={styles.card}>
        <View style={styles.head}>
          <IconTile icon="hourglass" size={40} />
          <Txt v="headline" style={{ flex: 1 }}>
            {t('screen.child.title')}
          </Txt>
        </View>
        <Txt v="callout" color={p.ink2}>
          {t('screen.setup.what')}
        </Txt>
        <Txt v="callout" color={p.ink2}>
          {t('screen.setup.honest')}
        </Txt>
        {steps.map((s, i) => (
          <View key={i} style={styles.step} accessible={false}>
            <View style={styles.stepHead}>
              {s.done ? (
                <Icon name="checkmark-circle" size={24} color={p.ok} />
              ) : (
                <View style={[styles.num, { backgroundColor: p.brandSoft }]}>
                  <Txt v="sub" color={p.brand} style={{ fontWeight: '700' }}>
                    {i + 1}
                  </Txt>
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt v="headline">{s.title}</Txt>
                <Txt v="sub" color={s.done ? p.ok : p.muted}>
                  {s.done ? t('screen.setup.on') : s.text}
                </Txt>
              </View>
            </View>
            {s.done ? null : <Btn small kind="secondary" icon="settings-outline" title={t('screen.setup.open')} onPress={() => s.open()} style={{ alignSelf: 'flex-start', marginLeft: 36 }} />}
          </View>
        ))}
        <Btn title={t('screen.setup.start')} icon="shield-checkmark" disabled={!guardReady(g)} loading={starting} onPress={turnOn} />
        {failed ? (
          <Txt v="sub" color={p.bad}>
            {t('screen.setup.fail')}
          </Txt>
        ) : null}
      </Card>
    );
  }

  // running: today's usage and what is left. Limits are shared by the child's devices: the server sends what the
  // others used today (from their latest reports, up to ~5 min old) and it adds to this phone's own minutes.
  const other = otherUsageOf(st);
  const apps = addUsage(usage?.apps ?? {}, other.apps);
  const used = countedUsage(usage?.total_min ?? 0, usage?.apps ?? {}, r.always_allowed) + other.total;
  const left = remaining(r.daily_limit_min, used);
  const limited = r.app_limits.filter((l) => apps[l.pkg]).slice(0, 3);
  const lockSoon = r.homework_lock && st.homework_due_today && !st.homework_done;
  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <IconTile icon="hourglass-outline" size={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt v="sub" color={p.muted} style={{ fontWeight: '600' }}>
            {t('screen.child.today')}
          </Txt>
          <Txt v="headline">{duration(used)}</Txt>
        </View>
        {left !== null ? (
          <View style={{ alignItems: 'flex-end' }}>
            <Txt v="sub" color={p.muted} style={{ fontWeight: '600' }}>
              {t('screen.child.left')}
            </Txt>
            <Txt v="headline" color={left > 0 ? p.ink : p.bad}>
              {duration(left)}
            </Txt>
          </View>
        ) : null}
      </View>
      {r.daily_limit_min ? <ProgressBar value={used / r.daily_limit_min} color={left === 0 ? p.bad : p.brand} /> : null}
      {other.total > 0 ? (
        <Txt v="sub" color={p.muted}>
          {t('devices.child.other', { dur: duration(other.total) })}
        </Txt>
      ) : null}
      {limited.map((l) => (
        <Txt key={l.pkg} v="sub" color={p.ink2}>
          {t('screen.child.appLine', { app: appName(st, l.pkg), used: apps[l.pkg] ?? 0, limit: l.minutes })}
        </Txt>
      ))}
      {unlockActive(r.unlock_until) && r.unlock_until ? (
        <Txt v="sub" color={p.ok} style={{ fontWeight: '600' }}>
          {t('screen.child.bonus', { hm: hmIn(r.unlock_until, st.tz) })}
        </Txt>
      ) : null}
      {lockSoon ? (
        <Txt v="sub" color={p.ink2}>
          {t('screen.child.hwLock', { hm: r.homework_lock_from })}
        </Txt>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.s, marginTop: space.s },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  step: { gap: space.xs },
  stepHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.s },
  num: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
