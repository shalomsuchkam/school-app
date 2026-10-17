import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { useT } from '@/lib/i18n';
import { usePalette } from '@/lib/theme';

import { Icon, Txt } from './ui';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Progress ring for the hero card. The arc glides to the new value; when the last task is done the
// counter becomes a tick and the ring gives one soft pop. Reduce Motion: no glide, no pop.
export function ProgressRing({ done, total, size = 96, color, track }: { done: number; total: number; size?: number; color?: string; track?: string }) {
  const t = useT();
  const p = usePalette();
  const reduce = useReducedMotion();
  const stroke = Math.max(8, Math.round(size / 9));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = total ? Math.min(1, done / total) : 0;
  const all = total > 0 && done >= total;
  const arcColor = color ?? (all ? p.okFill : p.brand);
  const progress = useSharedValue(reduce ? frac : 0);
  const pop = useSharedValue(1);
  useEffect(() => {
    progress.set(reduce ? frac : withTiming(frac, { duration: 700, easing: Easing.bezier(0.23, 1, 0.32, 1) }));
  }, [frac, reduce, progress]);
  useEffect(() => {
    if (all && !reduce) pop.set(withSequence(withTiming(1.06, { duration: 140 }), withSpring(1, { duration: 450, dampingRatio: 0.6 })));
  }, [all, reduce, pop]);
  const arc = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - progress.get()) }));
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));
  return (
    <Animated.View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('child.ring.a11y', { done, total })}
      accessibilityValue={{ min: 0, max: Math.max(total, 1), now: done }}
      style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, popStyle]}
    >
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track ?? p.fill} strokeWidth={stroke} fill="none" />
        <AnimatedCircle cx={size / 2} cy={size / 2} r={r} stroke={arcColor} strokeWidth={stroke} strokeLinecap="round" fill="none" strokeDasharray={`${c} ${c}`} animatedProps={arc} />
      </Svg>
      {all ? (
        <View style={{ width: size * 0.46, height: size * 0.46, borderRadius: size, backgroundColor: p.okFill, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="checkmark" size={size * 0.3} color="#fff" />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Txt v={size < 88 ? 'title' : 'largeTitle'} style={{ fontVariant: ['tabular-nums'] }}>
            {done}
          </Txt>
          <Txt v={size < 88 ? 'sub' : 'callout'} color={p.muted} style={{ fontVariant: ['tabular-nums'], fontWeight: '600' }}>
            /{total}
          </Txt>
        </View>
      )}
    </Animated.View>
  );
}
