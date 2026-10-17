import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

// The exercise-book set: ink blue, red pen, green tick, highlighter yellow, pencil grey.
const COLORS = ['#2A4BB0', '#BC3226', '#1D7346', '#F2C14E', '#7FA0E8', '#E7A39B'];

function Piece({ i, w, h }: { i: number; w: number; h: number }) {
  const t = useSharedValue(0);
  // Positions are fractions of the window, so rotation / tablets / foldables keep the burst full-width.
  const [{ fx, drift, spin, delay, size, duration }] = useState(() => ({
    fx: Math.random(),
    drift: (Math.random() - 0.5) * 160,
    spin: (Math.random() - 0.5) * 900,
    delay: Math.random() * 350,
    size: 7 + Math.random() * 7,
    duration: 1800 + Math.random() * 800,
  }));
  useEffect(() => {
    t.set(withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.quad) })));
  }, [t, delay, duration]);
  const style = useAnimatedStyle(() => ({
    opacity: 1 - t.get() * 0.85,
    transform: [{ translateX: fx * w + drift * t.get() }, { translateY: -40 + (h + 80) * t.get() }, { rotate: `${spin * t.get()}deg` }],
  }));
  return <Animated.View style={[styles.piece, { width: size, height: size * 1.6, backgroundColor: COLORS[i % COLORS.length], borderRadius: i % 3 ? 2 : size }, style]} />;
}

// Celebration when the whole day is done; skipped when the user prefers reduced motion.
export function Confetti({ run }: { run: number }) {
  const reduce = useReducedMotion();
  const { width, height } = useWindowDimensions();
  if (!run || reduce) return null;
  // Wider screens get a few more pieces so the burst doesn't look sparse on a tablet.
  const count = width > 600 ? 40 : 28;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} key={run}>
      {Array.from({ length: count }, (_, i) => (
        <Piece key={i} i={i} w={width} h={height} />
      ))}
    </View>
  );
}
const styles = StyleSheet.create({ piece: { position: 'absolute', top: 0, left: 0 } });
