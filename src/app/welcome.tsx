import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Btn, Txt } from '@/components/ui';
import { gradients, radius } from '@/lib/theme';

const FEATURES = [
  ['📸', 'Фото домашки', 'Только камерой, по каждому предмету'],
  ['⏰', 'Напоминания', 'Ребёнку — заранее, родителю — если не успел'],
  ['✅', 'Одобрение пропусков', 'Без родителя пункт не закрывается'],
];

export default function Welcome() {
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient colors={gradients.night} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: insets.top + 40 }}>
        <Animated.View entering={FadeInDown.duration(400)}>
          <View style={styles.logo}>
            <Text style={{ fontSize: 40 }}>📚</Text>
          </View>
          <Txt v="largeTitle" color="#fff" style={{ fontSize: 40, lineHeight: 46, marginTop: 22 }}>
            Уроки{'\n'}под контролем
          </Txt>
          <Txt v="body" color="rgba(255,255,255,0.78)" style={{ marginTop: 10 }}>
            Домашка, вещи на завтра и спокойствие родителей — в одном приложении.
          </Txt>
        </Animated.View>
        <View style={{ marginTop: 32, gap: 14 }}>
          {FEATURES.map(([e, t, s], i) => (
            <Animated.View key={t} entering={FadeInDown.delay(120 + i * 80).duration(400)} style={styles.feature}>
              <Text style={{ fontSize: 24 }}>{e}</Text>
              <View style={{ flex: 1 }}>
                <Txt v="headline" color="#fff">
                  {t}
                </Txt>
                <Txt v="sub" color="rgba(255,255,255,0.7)">
                  {s}
                </Txt>
              </View>
            </Animated.View>
          ))}
        </View>
      </View>
      <Animated.View entering={FadeInUp.delay(300).duration(400)} style={[styles.bottom, { paddingBottom: insets.bottom + 20 }]}>
        <Btn title="Я родитель — начать" onPress={() => router.push('/onboarding')} />
        <Btn title="У меня есть код" kind="plain" onPress={() => router.push('/join')} style={{ marginTop: 10 }} />
      </Animated.View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  logo: { width: 76, height: 76, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: radius.l, backgroundColor: 'rgba(255,255,255,0.09)' },
  bottom: { paddingHorizontal: 24 },
});
