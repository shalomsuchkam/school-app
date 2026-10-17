import type { ReactNode } from 'react';
import { Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

// Motion tokens. Springs use Apple's two designer parameters (duration ≈ response, dampingRatio).
export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
export const motion = {
  // press-in is a short ease-out; the release settles on a critically damped spring (interruptible)
  press: { duration: 110, easing: EASE_OUT },
  release: { duration: 260, dampingRatio: 1 },
  // default settle for things that move without a finger on them
  settle: { duration: 400, dampingRatio: 1 },
  // sheets open without overshoot; a drag released short of dismissal snaps back with a little bounce
  sheetOpen: { duration: 340, dampingRatio: 1 },
  snapBack: { duration: 300, dampingRatio: 0.8 },
  exit: { duration: 200, easing: EASE_OUT },
} as const;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Pressable with physical press feedback: scales to `scaleTo` the moment the finger lands and springs
 * back on release, on the UI thread. With Reduce Motion it dims instead of scaling.
 */
export function PressableScale({
  scaleTo = 0.97,
  style,
  onPressIn,
  onPressOut,
  children,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & { scaleTo?: number; style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const reduce = useReducedMotion();
  const pressed = useSharedValue(0);
  const anim = useAnimatedStyle(() => (reduce ? { opacity: 1 - pressed.get() * 0.3 } : { transform: [{ scale: 1 - pressed.get() * (1 - scaleTo) }] }));
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e: GestureResponderEvent) => {
        pressed.set(withTiming(1, motion.press));
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        pressed.set(withSpring(0, motion.release));
        onPressOut?.(e);
      }}
      style={[style, anim]}
    >
      {children}
    </AnimatedPressable>
  );
}
