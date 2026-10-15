import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Btn, Txt } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { gradients, radius } from '@/lib/theme';

const FEATURES = [
  ['📸', 'f1'],
  ['⏰', 'f2'],
  ['✅', 'f3'],
];

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const focused = useIsFocused();
  const t = useT();
  // Already in a family: never offer to create/join another one over the current session.
  if (session) return <Redirect href={session.role === 'child' ? '/child' : '/parent'} />;
  return (
    <LinearGradient colors={gradients.night} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
      {/* light icons on the dark gradient in both themes; unmounts on blur so the root 'auto' style returns */}
      {focused ? <StatusBar style="light" /> : null}
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: insets.top + 40 }}>
        <Animated.View entering={FadeInDown.duration(400)}>
          <View style={styles.logo}>
            <Text style={{ fontSize: 40 }}>📚</Text>
          </View>
          <Txt v="largeTitle" color="#fff" style={{ fontSize: 40, lineHeight: 46, marginTop: 22 }}>
            {t('onboarding.welcome.title')}
          </Txt>
          <Txt v="body" color="rgba(255,255,255,0.78)" style={{ marginTop: 10 }}>
            {t('onboarding.welcome.subtitle')}
          </Txt>
        </Animated.View>
        <View style={{ marginTop: 32, gap: 14 }}>
          {FEATURES.map(([e, f], i) => (
            <Animated.View key={f} entering={FadeInDown.delay(120 + i * 80).duration(400)} style={styles.feature}>
              <Text style={{ fontSize: 24 }}>{e}</Text>
              <View style={{ flex: 1 }}>
                <Txt v="headline" color="#fff">
                  {t(`onboarding.welcome.${f}.title`)}
                </Txt>
                <Txt v="sub" color="rgba(255,255,255,0.7)">
                  {t(`onboarding.welcome.${f}.text`)}
                </Txt>
              </View>
            </Animated.View>
          ))}
        </View>
      </View>
      <Animated.View entering={FadeInUp.delay(300).duration(400)} style={[styles.bottom, { paddingBottom: insets.bottom + 20 }]}>
        <Btn title={t('onboarding.welcome.parent')} onPress={() => router.push('/onboarding')} />
        <Btn title={t('onboarding.welcome.haveCode')} kind="plain" onPress={() => router.push('/join')} style={{ marginTop: 10 }} />
      </Animated.View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  logo: { width: 76, height: 76, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: radius.l, backgroundColor: 'rgba(255,255,255,0.09)' },
  bottom: { paddingHorizontal: 24 },
});
