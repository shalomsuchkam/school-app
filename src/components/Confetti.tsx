import { useEffect, useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

const COLORS = ['#6355F5', '#9B5CF6', '#10A37F', '#FDB241', '#FF7A7E', '#4DABF7'];
const { width: W, height: H } = Dimensions.get('window');

function Piece({ i }: { i: number }) {
  const t = useSharedValue(0);
  const [{ x0, drift, spin, delay, size, duration }] = useState(() => ({
    x0: Math.random() * W,
    drift: (Math.random() - 0.5) * 160,
    spin: (Math.random() - 0.5) * 900,
    delay: Math.random() * 300,
    size: 7 + Math.random() * 7,
    duration: 1800 + Math.random() * 700,
  }));
  useEffect(() => {
    t.value = withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.quad) }));
  }, [t, delay, duration]);
  const style = useAnimatedStyle(() => ({
    opacity: 1 - t.value * 0.85,
    transform: [{ translateX: x0 + drift * t.value }, { translateY: -40 + (H + 80) * t.value }, { rotate: `${spin * t.value}deg` }],
  }));
  return <Animated.View style={[styles.piece, { width: size, height: size * 1.6, backgroundColor: COLORS[i % COLORS.length], borderRadius: i % 3 ? 2 : size }, style]} />;
}

// Celebration when the whole day is done; skipped when the user prefers reduced motion.
export function Confetti({ run }: { run: number }) {
  const reduce = useReducedMotion();
  if (!run || reduce) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} key={run}>
      {Array.from({ length: 24 }, (_, i) => (
        <Piece key={i} i={i} />
      ))}
    </View>
  );
}
const styles = StyleSheet.create({ piece: { position: 'absolute', top: 0, left: 0 } });
