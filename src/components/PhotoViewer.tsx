import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Txt } from './ui';

const MAX = 4;
function clamp(v: number, lim: number) {
  'worklet';
  return Math.min(lim, Math.max(-lim, v));
}

// Pinch, pan and double-tap zoom on both platforms (ScrollView zoom props are iOS-only).
function Zoomable({ children }: { children: ReactNode }) {
  const size = useSharedValue({ w: 0, h: 0 });
  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const start = useSharedValue({ s: 1, x: 0, y: 0, fx: 0, fy: 0 });

  const fit = (s: number, x: number, y: number, animate: boolean) => {
    'worklet';
    const { w, h } = size.get();
    const nx = clamp(x, (w * (s - 1)) / 2);
    const ny = clamp(y, (h * (s - 1)) / 2);
    scale.set(animate ? withTiming(s) : s);
    tx.set(animate ? withTiming(nx) : nx);
    ty.set(animate ? withTiming(ny) : ny);
  };
  const pinch = Gesture.Pinch()
    .onStart((e) => {
      const { w, h } = size.get();
      start.set({ s: scale.get(), x: tx.get(), y: ty.get(), fx: e.focalX - w / 2, fy: e.focalY - h / 2 });
    })
    .onUpdate((e) => {
      const st = start.get();
      const { w, h } = size.get();
      const s = Math.min(MAX, Math.max(1, st.s * e.scale));
      const k = s / st.s; // keeps the point under the fingers in place
      fit(s, e.focalX - w / 2 - k * (st.fx - st.x), e.focalY - h / 2 - k * (st.fy - st.y), false);
    })
    .onEnd(() => {
      if (scale.get() < 1.02) fit(1, 0, 0, true);
    });
  const pan = Gesture.Pan()
    .maxPointers(1)
    .onStart(() => start.set({ s: scale.get(), x: tx.get(), y: ty.get(), fx: 0, fy: 0 }))
    .onUpdate((e) => {
      const st = start.get();
      fit(scale.get(), st.x + e.translationX, st.y + e.translationY, false);
    });
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      const { w, h } = size.get();
      if (scale.get() > 1.05) fit(1, 0, 0, true);
      else fit(2.5, -1.5 * (e.x - w / 2), -1.5 * (e.y - h / 2), true);
    });
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: tx.get() }, { translateY: ty.get() }, { scale: scale.get() }] }));
  return (
    <GestureDetector gesture={Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan))}>
      <View style={{ flex: 1, overflow: 'hidden' }} onLayout={(e) => size.set({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        <Animated.View style={[{ flex: 1 }, style]}>{children}</Animated.View>
      </View>
    </GestureDetector>
  );
}

export function PhotoViewer({ url, id, caption, onClose }: { url: string | null; id?: number; caption?: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!url} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {/* A Modal renders outside the app's root gesture view, so it needs its own on Android. */}
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
        {url ? (
          <Zoomable>
            <Image source={{ uri: url, cacheKey: id != null ? `photo-${id}` : undefined }} style={{ flex: 1 }} contentFit="contain" />
          </Zoomable>
        ) : null}
        <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
          <Txt v="headline" color="#fff" style={{ flex: 1 }} numberOfLines={1}>
            {caption ?? ''}
          </Txt>
          <Pressable onPress={onClose} hitSlop={12} style={styles.close}>
            <Txt v="headline" color="#fff">
              ✕
            </Txt>
          </Pressable>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  bar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, backgroundColor: 'rgba(0,0,0,0.45)' },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
});
