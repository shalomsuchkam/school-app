import { StyleSheet, View } from 'react-native';

import { Card, IconTile, Txt } from '@/components/ui';
import type { DeviceReport } from '@/lib/api';
import { duration, relativeAgo } from '@/lib/format';
import { tn, useT } from '@/lib/i18n';
import { guardHealth } from '@/lib/screenTime';

import { iosScreenTimeReleased } from './IosScreenTime';
import { space, usePalette } from '@/lib/theme';

/**
 * How the child's phone is doing, from its latest report. Calm wording on purpose: a silent phone is
 * usually a phone without internet, not a child who broke the rules.
 */
// title: which of the child's devices this card is about (several devices: one card each).
export function GuardCard({ device, enabled, usedToday, title }: { device: DeviceReport | null; enabled: boolean; usedToday: number; title?: string }) {
  const p = usePalette();
  const t = useT();
  const h = guardHealth(device);
  const label = title ? (
    <Txt v="sub" color={p.muted} style={{ fontWeight: '600' }} numberOfLines={1}>
      {title}
    </Txt>
  ) : null;

  if (h.kind === 'none') {
    return (
      <Card style={styles.card}>
        <View style={styles.head}>
          <IconTile icon="phone-portrait-outline" size={40} tone="neutral" />
          <Txt v="headline" style={{ flex: 1 }}>
            {t('screen.guard.noneTitle')}
          </Txt>
        </View>
        <Txt v="callout" color={p.ink2}>
          {t('screen.guard.noneText')}
        </Txt>
        <Txt v="sub" color={p.muted}>
          {t(iosScreenTimeReleased ? 'screen.guard.iosOn' : 'screen.guard.ios')}
        </Txt>
      </Card>
    );
  }

  const ago = device?.reported_at ? relativeAgo(device.reported_at) : '';
  if (h.kind === 'off') {
    return (
      <Card tone={enabled ? 'warn' : undefined} style={styles.card}>
        {label}
        <View style={styles.head}>
          <IconTile icon="shield-outline" size={40} tone="warn" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt v="headline">{t('screen.guard.offTitle')}</Txt>
            <Txt v="sub" color={p.muted}>
              {t('screen.guard.lastReport', { ago })}
            </Txt>
          </View>
        </View>
        <Txt v="callout" color={p.ink2}>
          {h.missing.map((m) => t(`screen.guard.miss.${m}`)).join(' ')}
        </Txt>
        <Txt v="callout" color={p.ink2}>
          {t('screen.guard.offText')}
        </Txt>
      </Card>
    );
  }

  if (h.kind === 'stale') {
    return (
      <Card tone={enabled ? 'warn' : undefined} style={styles.card}>
        {label}
        <View style={styles.head}>
          <IconTile icon="cloud-offline-outline" size={40} tone="warn" />
          <Txt v="headline" style={{ flex: 1 }}>
            {tn('screen.guard.staleTitle', h.hours)}
          </Txt>
        </View>
        <Txt v="callout" color={p.ink2}>
          {t('screen.guard.staleText')}
        </Txt>
      </Card>
    );
  }

  return (
    <Card tone={enabled ? 'ok' : undefined} style={styles.card}>
      {label}
      <View style={styles.head}>
        <IconTile icon="shield-checkmark" size={40} tone="ok" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt v="headline">{enabled ? t('screen.guard.okTitle') : t('screen.guard.readyTitle')}</Txt>
          <Txt v="sub" color={p.muted}>
            {t('screen.guard.lastReport', { ago })} · {t('screen.usage.today', { dur: duration(usedToday) })}
          </Txt>
        </View>
      </View>
      {!h.battery_ok ? (
        <Txt v="sub" color={p.ink2}>
          {t('screen.guard.battery')}
        </Txt>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.s },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.s },
});
