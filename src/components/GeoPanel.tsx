import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import * as Location from 'expo-location';

import { Banner } from '@/components/ui';
import { pingNow, requestGeoPermission, syncTracking } from '@/lib/geo';
import { useT } from '@/lib/i18n';

type Perm = 'granted' | 'foreground-only' | 'denied' | 'unknown';

// Child home: location sharing (docs/LOCATION.md). Shown only when the parent turned tracking on for this child
// (track_location in /child/state). It is deliberately visible — open parental monitoring, never covert: the child
// sees that location is on and is asked, in plain words, to allow it. Reconciles the background tracker with the
// parent's setting and the current permission, the same way ScreenTimePanel does for screen time.
export function GeoPanel({ trackLocation }: { trackLocation: boolean }) {
  const t = useT();
  const [perm, setPerm] = useState<Perm>('unknown');

  const labels = useCallback(() => ({ title: t('loc.child.on.title'), body: t('loc.child.on.text') }), [t]);

  const reconcile = useCallback(async () => {
    if (Platform.OS !== 'android' && Platform.OS !== 'ios') return;
    if (!trackLocation) {
      await syncTracking(false, labels());
      return;
    }
    // what permission do we currently hold (without prompting)?
    let fgGranted = false;
    let bgGranted = false;
    try {
      const fg = await Location.getForegroundPermissionsAsync();
      fgGranted = fg.granted;
      if (fgGranted) bgGranted = (await Location.getBackgroundPermissionsAsync()).granted;
    } catch {
      // treat as unknown; the banner will offer to request
    }
    setPerm(!fgGranted ? 'denied' : bgGranted ? 'granted' : 'foreground-only');
    if (fgGranted) {
      await syncTracking(true, labels());
      void pingNow();
    } else {
      await syncTracking(false, labels());
    }
  }, [trackLocation, labels]);

  useFocusEffect(
    useCallback(() => {
      reconcile();
    }, [reconcile]),
  );
  useEffect(() => {
    // back from the OS location dialog / settings: refresh the banner and (re)start tracking at once
    const sub = AppState.addEventListener('change', (a) => a === 'active' && reconcile());
    return () => sub.remove();
  }, [reconcile]);

  if (!trackLocation || (Platform.OS !== 'android' && Platform.OS !== 'ios')) return null;

  const ask = async () => {
    const r = await requestGeoPermission();
    setPerm(r === 'granted' ? 'granted' : r === 'foreground-only' ? 'foreground-only' : 'denied');
    if (r !== 'denied') {
      await syncTracking(true, labels());
      void pingNow();
    }
  };

  if (perm === 'denied') {
    return <Banner tone="brand" icon="location-outline" title={t('loc.child.perm.title')} text={t('loc.child.perm.text')} action={{ label: t('loc.child.perm.btn'), onPress: ask, icon: 'navigate' }} />;
  }
  if (perm === 'foreground-only') {
    return <Banner tone="warn" icon="location-outline" text={t('loc.child.perm.foreground')} action={{ label: t('loc.child.perm.open'), onPress: () => Linking.openSettings(), icon: 'settings-outline' }} live />;
  }
  if (perm === 'granted') {
    return <Banner tone="brand" icon="location" title={t('loc.child.on.title')} text={t('loc.child.on.text')} live />;
  }
  return null;
}
