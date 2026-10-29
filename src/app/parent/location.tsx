import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { LocationMap, type MapPoint } from '@/components/LocationMap';
import { Banner, Btn, Card, Group, Icon, IconBtn, type IconName, Loading, Screen, ToggleRow, Txt, useToast } from '@/components/ui';
import { api, type ChildLoc, type Child } from '@/lib/api';
import { useIsViewer } from '@/lib/auth';
import { ChildSwitcher, currentChildReady, getCurrentChild, setCurrentChild, useCurrentChild } from '@/lib/currentChild';
import { relativeAgo } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { space, usePalette } from '@/lib/theme';

// Parent: where is my child (docs/LOCATION.md). The child's phone reports its position (src/lib/geo.ts); here the
// parent sees the latest point on a map, the recent trail, and — crucially — an honest status line when the child
// turned location off or revoked the permission (the server also pushes a notification the moment that happens).
export default function LocationScreen() {
  const p = usePalette();
  const t = useT();
  const toast = useToast();
  const viewer = useIsViewer();
  const [kids, setKids] = useState<Child[]>([]);
  const [childId] = useCurrentChild(kids);
  const [locs, setLocs] = useState<ChildLoc[] | null>(null);
  const [trail, setTrail] = useState<MapPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const cid = await currentChildReady();
      const me = await api.me();
      setKids(me.children);
      const res = await api.locations();
      if (getCurrentChild() !== cid) return;
      setLocs(res.children);
      const target = cid ?? me.children[0]?.id ?? res.children[0]?.child_id;
      if (target) {
        try {
          const tr = await api.locationTrail(target);
          setTrail(tr.trail.map((x) => ({ lat: x.lat, lng: x.lng })));
        } catch {
          setTrail([]);
        }
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

  const back = () => (router.canGoBack() ? router.back() : router.replace('/parent/settings'));
  const close = <IconBtn icon="close" label={t('common.close')} onPress={back} />;
  if (!locs) return <Loading error={error} onRetry={load} />;

  const switchChild = (id: number | null) => {
    if (id === null) return;
    setCurrentChild(id);
    setTrail([]);
    load();
  };
  const cur = locs.find((l) => l.child_id === childId) ?? locs.find((l) => l.child_id === kids[0]?.id) ?? locs[0] ?? null;

  const setTracking = async (on: boolean) => {
    if (!cur) return;
    setBusy(true);
    setLocs((cs) => (cs ? cs.map((l) => (l.child_id === cur.child_id ? { ...l, tracking: on } : l)) : cs));
    try {
      await api.setTrackLocation(on, cur.child_id);
      toast.show(on ? t('loc.toggleOn') : t('loc.toggleOff'));
      load();
    } catch (e) {
      setLocs((cs) => (cs ? cs.map((l) => (l.child_id === cur.child_id ? { ...l, tracking: !on } : l)) : cs));
      toast.show((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const openMaps = (lat: number, lng: number) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    Linking.openURL(url).catch(() => {});
  };

  const hasFix = cur != null && cur.lat != null && cur.lng != null;
  const statusTone = (s: ChildLoc['status']) => (s === 'live' ? p.ok : s === 'stale' ? p.warn : s === 'never' ? p.muted : p.bad);
  const statusIcon = (s: ChildLoc['status']): IconName => (s === 'live' ? 'location' : s === 'stale' ? 'time-outline' : s === 'no_permission' ? 'lock-closed' : s === 'never' ? 'help-circle-outline' : 'warning');

  return (
    <Screen title={t('loc.title')} subtitle={t('loc.subtitle')} right={close} onRefresh={load} footer={toast.node}>
      <ChildSwitcher list={kids} value={childId} onChange={switchChild} />

      {viewer ? null : (
        <Group style={{ marginTop: space.xs }}>
          <ToggleRow icon="navigate" tint="blue" title={t('loc.toggle')} subtitle={cur?.tracking ? t('loc.toggleOn') : t('loc.toggleOff')} value={!!cur?.tracking} onChange={busy ? () => {} : setTracking} />
        </Group>
      )}

      {!cur?.tracking ? (
        <Txt v="sub" color={p.muted} style={styles.hint}>
          {t('loc.intro')}
        </Txt>
      ) : (
        <>
          {/* status line — honest about why the dot is not moving */}
          <View style={styles.statusRow}>
            <Icon name={statusIcon(cur.status)} size={16} color={statusTone(cur.status)} />
            <Txt v="callout" color={statusTone(cur.status)} style={{ fontWeight: '600', flex: 1 }}>
              {t(`loc.status.${cur.status}`)}
            </Txt>
            {cur.reported_at ? (
              <Txt v="sub" color={p.muted}>
                {t('loc.updated', { when: relativeAgo(cur.reported_at) })}
              </Txt>
            ) : null}
          </View>

          {cur.status === 'services_off' ? <Banner tone="bad" icon="location-outline" text={t('loc.servicesOff.text', { name: cur.name })} live /> : null}
          {cur.status === 'no_permission' ? <Banner tone="bad" icon="lock-closed" text={t('loc.noPermission.text', { name: cur.name })} live /> : null}
          {cur.status === 'never' ? <Banner tone="warn" icon="phone-portrait-outline" text={t('loc.never.text')} /> : null}

          {hasFix ? (
            <>
              <View style={{ marginTop: space.s }}>
                <LocationMap lat={cur.lat as number} lng={cur.lng as number} accuracy={cur.accuracy} trail={trail} />
              </View>
              <View style={styles.meta}>
                {cur.battery != null ? <MetaChip icon="battery-half" text={t('loc.battery', { n: cur.battery })} /> : null}
                {cur.accuracy != null ? <MetaChip icon="radio-outline" text={t('loc.accuracy', { m: Math.round(cur.accuracy) })} /> : null}
                {cur.moving ? <MetaChip icon="walk" text={t('loc.moving')} /> : null}
              </View>
              <Btn kind="secondary" icon="map" title={t('loc.openMaps')} onPress={() => openMaps(cur.lat as number, cur.lng as number)} style={{ marginTop: space.s }} />
            </>
          ) : cur.status !== 'never' ? (
            <Card style={{ marginTop: space.s, alignItems: 'center', gap: space.xs }}>
              <Icon name="location-outline" size={28} color={p.muted} />
              <Txt v="callout" color={p.muted} style={{ textAlign: 'center' }}>
                {t('loc.noPoint')}
              </Txt>
            </Card>
          ) : null}

          <Txt v="sub" color={p.muted} style={styles.hint}>
            {t('loc.on.hint')}
          </Txt>
        </>
      )}
    </Screen>
  );
}

function MetaChip({ icon, text }: { icon: IconName; text: string }) {
  const p = usePalette();
  return (
    <View style={[styles.chip, { backgroundColor: p.fill }]}>
      <Icon name={icon} size={14} color={p.ink2} />
      <Txt v="sub" color={p.ink2} style={{ fontWeight: '600' }}>
        {text}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { marginTop: space.s, marginHorizontal: 6 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.m, marginHorizontal: 4 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.s },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
});
