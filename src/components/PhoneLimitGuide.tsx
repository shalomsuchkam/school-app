import { useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';

import { Btn, Chip, Txt, Sheet, useToast } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { radius, usePalette } from '@/lib/theme';

// The app cannot lock a phone (the OS forbids it): this sheet walks the parent through the built-in
// parental controls — Google Family Link for an Android child, Apple Screen Time for an iPhone child.
const FAMILY_LINK_WEB = 'https://families.google.com/families';
const FAMILY_LINK_STORE = Platform.OS === 'ios' ? 'https://apps.apple.com/app/google-family-link/id1150085200' : 'market://details?id=com.google.android.apps.kids.familylink';
const ANDROID_STEPS = ['a1', 'a2', 'a3', 'a4', 'a5'];
const IOS_STEPS = ['i1', 'i2', 'i3', 'i4', 'i5', 'i6'];

export function PhoneLimitGuide({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const p = usePalette();
  const t = useT();
  const toast = useToast();
  // the child's phone OS is unknown; start with the one matching the parent's phone
  const [os, setOs] = useState<'android' | 'ios'>(Platform.OS === 'ios' ? 'ios' : 'android');
  const steps = os === 'android' ? ANDROID_STEPS : IOS_STEPS;

  const openFamilyLink = async () => {
    try {
      await Linking.openURL(FAMILY_LINK_WEB);
    } catch {
      try {
        await Linking.openURL(FAMILY_LINK_STORE);
      } catch {
        toast.show(t('parent.phone.openFail'));
      }
    }
  };
  const openScreenTime = () => Linking.openSettings().catch(() => toast.show(t('parent.phone.openFail')));

  return (
    <Sheet visible={visible} title={t('parent.phone.title')} onClose={onClose} overlay={toast.node}>
      <Txt v="callout" color={p.muted} style={{ marginBottom: 14 }}>
        {t('parent.phone.intro')}
      </Txt>
      <View style={styles.seg}>
        <Chip label={t('parent.phone.android')} selected={os === 'android'} onPress={() => setOs('android')} />
        <Chip label={t('parent.phone.ios')} selected={os === 'ios'} onPress={() => setOs('ios')} />
      </View>
      <View style={[styles.card, { backgroundColor: p.card }]}>
        {steps.map((k, i) => (
          <View key={k} style={styles.step}>
            <View style={[styles.num, { backgroundColor: p.brandSoft }]}>
              <Txt v="sub" color={p.brand} style={{ fontVariant: ['tabular-nums'] }}>
                {i + 1}
              </Txt>
            </View>
            <Txt v="callout" style={{ flex: 1 }}>
              {t(`parent.phone.${k}`)}
            </Txt>
          </View>
        ))}
      </View>
      {os === 'ios' && Platform.OS !== 'ios' ? (
        <Txt v="sub" color={p.muted} style={styles.note}>
          {t('parent.phone.iosHint')}
        </Txt>
      ) : null}
      <View style={[styles.tip, { backgroundColor: p.okSoft }]}>
        <Txt v="sub">💡 {t('parent.phone.tip')}</Txt>
      </View>
      {os === 'android' ? (
        <Btn title={t('parent.phone.openFL')} icon="open-outline" onPress={openFamilyLink} style={{ marginTop: 14 }} />
      ) : (
        <Btn title={t('parent.phone.openST')} icon="settings-outline" onPress={openScreenTime} style={{ marginTop: 14 }} />
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  seg: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  card: { borderRadius: radius.l, padding: 14, gap: 12 },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  num: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  note: { marginTop: 10, marginHorizontal: 4 },
  tip: { borderRadius: radius.m, padding: 12, marginTop: 12 },
});
