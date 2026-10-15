import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router } from 'expo-router';
import { ScrollView, StyleSheet, useColorScheme, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Btn, Txt } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { radius, usePalette } from '@/lib/theme';

const APP_ICON = require('../../assets/images/icon.png');
const MAX_W = 560;

// Benefit rows: copy lives in 'onboarding.welcome.f<n>.title|text'.
const FEATURES = [
  { icon: 'camera', key: 'f1' },
  { icon: 'alarm', key: 'f2' },
  { icon: 'shield-checkmark', key: 'f3' },
] as const;

export default function Welcome() {
  const p = usePalette();
  const dark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { session } = useAuth();
  const t = useT();
  // Already in a family: never offer to create/join another one over the current session.
  if (session) return <Redirect href={session.role === 'child' ? '/child' : '/parent'} />;

  const compact = height < 700;
  const iconSize = compact ? 72 : width >= 600 ? 104 : 88;
  // A soft brand wash behind the hero, fading into the page background in both themes.
  const wash = dark ? (['#2A2560', p.bg] as const) : (['#E4E0FF', p.bg] as const);

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <LinearGradient colors={wash} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: Math.min(height * 0.62, 560) }} />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingTop: insets.top + (compact ? 16 : 32), paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.column}>
          <Animated.View entering={FadeInDown.duration(450)} style={{ alignItems: 'center' }}>
            <View style={[styles.iconShadow, { shadowColor: p.shadow, borderRadius: iconSize * 0.23 }]}>
              <Image source={APP_ICON} style={{ width: iconSize, height: iconSize, borderRadius: iconSize * 0.23 }} accessibilityIgnoresInvertColors />
            </View>
            <Txt v="largeTitle" accessibilityRole="header" style={[styles.brand, compact && { fontSize: 38, lineHeight: 44, marginTop: 14 }]}>
              {t('onboarding.welcome.brand')}
            </Txt>
            <Txt v="body" color={p.ink2} style={styles.value}>
              {t('onboarding.welcome.value')}
            </Txt>
          </Animated.View>

          <View style={{ marginTop: compact ? 22 : 32, gap: 10 }}>
            {FEATURES.map((f, i) => (
              <Animated.View
                key={f.key}
                entering={FadeInDown.delay(120 + i * 80).duration(420)}
                style={[styles.feature, { backgroundColor: p.card, borderColor: p.line, shadowColor: p.shadow }]}
              >
                <View style={[styles.featureIcon, { backgroundColor: p.brandSoft }]}>
                  <Ionicons name={f.icon} size={22} color={p.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt v="headline">{t(`onboarding.welcome.${f.key}.title`)}</Txt>
                  <Txt v="sub" color={p.muted} style={{ marginTop: 2 }}>
                    {t(`onboarding.welcome.${f.key}.text`)}
                  </Txt>
                </View>
              </Animated.View>
            ))}
          </View>
        </View>
      </ScrollView>

      <Animated.View entering={FadeInUp.delay(320).duration(420)} style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: insets.bottom + 16 }}>
        <View style={[styles.column, { gap: 10 }]}>
          <Btn title={t('onboarding.welcome.parent')} onPress={() => router.push('/onboarding')} />
          <Btn title={t('onboarding.welcome.haveCode')} kind="secondary" onPress={() => router.push('/join')} />
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
  iconShadow: { shadowOpacity: 0.28, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 8, backgroundColor: 'transparent' },
  brand: { fontSize: 46, lineHeight: 52, letterSpacing: -1, marginTop: 18, textAlign: 'center' },
  value: { marginTop: 8, textAlign: 'center', maxWidth: 420 },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: radius.l,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  featureIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
