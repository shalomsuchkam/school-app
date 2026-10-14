import { Image } from 'expo-image';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Txt } from './ui';

export function PhotoViewer({ url, caption, onClose }: { url: string | null; caption?: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!url} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <ScrollView maximumZoomScale={4} minimumZoomScale={1} centerContent contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
          {url ? <Image source={{ uri: url }} style={{ width: '100%', height: 640 }} contentFit="contain" /> : null}
        </ScrollView>
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
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  bar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, backgroundColor: 'rgba(0,0,0,0.45)' },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
});
