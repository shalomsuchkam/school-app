import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { useT } from '@/lib/i18n';

import { Txt } from './ui';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// White ring for the gradient hero. The arc glides to the new value (instant with reduced motion);
// when everything is done the counter turns into a party emoji.
export function ProgressRing({ done, total, size = 96 }: { done: number; total: number; size?: number }) {
  const t = useT();
  const reduce = useReducedMotion();
  const stroke = Math.max(7, Math.round(size / 10));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = total ? Math.min(1, done / total) : 0;
  const all = total > 0 && done >= total;
  const progress = useSharedValue(reduce ? frac : 0);
  useEffect(() => {
    progress.set(reduce ? frac : withTiming(frac, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [frac, reduce, progress]);
  const arc = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - progress.get()) }));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('child.ring.a11y', { done, total })}
      accessibilityValue={{ min: 0, max: Math.max(total, 1), now: done }}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.25)" strokeWidth={stroke} fill="none" />
        <AnimatedCircle cx={size / 2} cy={size / 2} r={r} stroke="#fff" strokeWidth={stroke} strokeLinecap="round" fill="none" strokeDasharray={`${c} ${c}`} animatedProps={arc} />
      </Svg>
      {all ? (
        <Text style={{ fontSize: size * 0.36 }}>🎉</Text>
      ) : (
        <Txt v={size < 88 ? 'headline' : 'title'} color="#fff" style={{ fontVariant: ['tabular-nums'] }}>
          {done}/{total}
        </Txt>
      )}
    </View>
  );
}
