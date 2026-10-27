import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router } from 'expo-router';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark, Btn, IconTile, NotebookRule, Txt } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { usePalette } from '@/lib/theme';

const MAX_W = 560;

// Benefit rows: copy lives in 'onboarding.welcome.f<n>.title|text'.
const FEATURES = [
  { icon: 'camera-outline', key: 'f1' },
  { icon: 'alarm-outline', key: 'f2' },
  { icon: 'shield-checkmark-outline', key: 'f3' },
] as const;

export default function Welcome() {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { session } = useAuth();
  const t = useT();
  // Already in a family: never offer to create/join another one over the current session.
  if (session) return <Redirect href={session.role === 'child' ? '/child' : '/parent'} />;

  const compact = height < 700;
  const markSize = compact ? 52 : width >= 600 ? 72 : 60;
  // ruled-paper band behind the mark and the name, fading into the page
  const band = insets.top + (compact ? 150 : 210);

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: band }}>
        {/* the mark carries the red margin line itself, so the page shows only the ruling */}
        <NotebookRule height={band} step={30} marginX={null} />
        <LinearGradient colors={[`${p.bg}00`, p.bg]} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: band * 0.55 }} />
      </View>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: insets.top + (compact ? 28 : 56), paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.column}>
          <Animated.View entering={FadeInDown.duration(420)}>
            <BrandMark size={markSize} />
            <Txt v="display" accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit style={[styles.brand, compact && { fontSize: 40, lineHeight: 44, marginTop: 16 }]}>
              {t('onboarding.welcome.brand')}
            </Txt>
            <Txt v="body" color={p.ink2} style={styles.value}>
              {t('onboarding.welcome.value')}
            </Txt>
          </Animated.View>

          <View style={{ marginTop: compact ? 28 : 40, gap: compact ? 16 : 22 }}>
            {FEATURES.map((f, i) => (
              <Animated.View key={f.key} entering={FadeInDown.delay(100 + i * 60).duration(380)} style={styles.feature}>
                <IconTile icon={f.icon} size={40} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt v="headline">{t(`onboarding.welcome.${f.key}.title`)}</Txt>
                  <Txt v="callout" color={p.muted} style={{ marginTop: 2 }}>
                    {t(`onboarding.welcome.${f.key}.text`)}
                  </Txt>
                </View>
              </Animated.View>
            ))}
          </View>
        </View>
      </ScrollView>

      <Animated.View entering={FadeInUp.delay(260).duration(380)} style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: insets.bottom + 16 }}>
        <View style={[styles.column, { gap: 10 }]}>
          <Btn title={t('onboarding.welcome.parent')} onPress={() => router.push('/onboarding')} />
          <Btn title={t('onboarding.welcome.haveCode')} kind="secondary" icon="key-outline" onPress={() => router.push('/join')} />
          <Txt v="sub" color={p.muted} style={{ textAlign: 'center', marginTop: 4 }}>
            {t('onboarding.welcome.footnote')}
          </Txt>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { width: '100%', maxWidth: MAX_W, alignSelf: 'center' },
  brand: { fontSize: 52, lineHeight: 56, letterSpacing: -1.6, marginTop: 20 },
  value: { marginTop: 8, maxWidth: 420, fontSize: 18, lineHeight: 25, letterSpacing: -0.3 },
  feature: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
});
