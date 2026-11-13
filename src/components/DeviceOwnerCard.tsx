import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { Card, Txt } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { guardStatus, type GuardStatus } from '@/lib/screenGuard';
import { space, usePalette } from '@/lib/theme';

/** Informational only: Android ownership cannot be granted by an in-app permission prompt. */
export function DeviceOwnerCard() {
  const t = useT();
  const p = usePalette();
  const [status, setStatus] = useState<GuardStatus | null>(null);
  const refresh = useCallback(() => {
    if (Platform.OS === 'android') void guardStatus().then(setStatus);
  }, []);
  useFocusEffect(refresh);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => state === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]);
  if (Platform.OS !== 'android' || !status?.supported) return null;
  const protectedNow = status.device_owner === true && status.uninstall_blocked === true;
  return (
    <Card style={{ gap: space.s, marginTop: space.s }}>
      <Txt v="headline">{t('owner.title')}</Txt>
      <Txt v="callout" color={protectedNow ? p.ok : p.ink2}>
        {t(protectedNow ? 'owner.protected' : status.device_owner ? 'owner.error' : 'owner.notManaged')}
      </Txt>
      <Txt v="sub" color={p.muted}>{t(protectedNow ? 'owner.release' : 'owner.setup')}</Txt>
      <Txt v="sub" color={p.muted}>{t('owner.limit')}</Txt>
    </Card>
  );
}
