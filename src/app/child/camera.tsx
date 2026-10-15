import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Btn, haptic, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';

// Live camera only: deliberately no gallery picker, so every photo is taken right now.
const MAX_SIDE = 2048;

export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const t = useT();
  const params = useLocalSearchParams<{ id: string; label: string; emoji: string; page: string }>();
  const taskId = Number(params.id);
  const [perm, requestPerm, getPerm] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const [torch, setTorch] = useState(false);
  const [shot, setShot] = useState<string | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [page, setPage] = useState(Number(params.page) || 1);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  // Access granted in the phone's Settings only shows up after a fresh check.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') getPerm();
    });
    return () => sub.remove();
  }, [getPerm]);

  if (!perm) return <View style={styles.bg} />;
  if (!perm.granted) {
    return (
      <View style={[styles.bg, styles.center, { paddingTop: insets.top }]}>
        <Text style={{ fontSize: 48 }}>📷</Text>
        <Txt v="title" color="#fff" style={{ marginTop: 12, textAlign: 'center' }}>
          {t('child.cam.permTitle')}
        </Txt>
        <Txt v="callout" color="rgba(255,255,255,0.7)" style={{ marginTop: 8, textAlign: 'center' }}>
          {t('child.cam.permText')}
        </Txt>
        <Btn
          title={perm.canAskAgain ? t('child.cam.allow') : t('child.cam.openSettings')}
          onPress={() => (perm.canAskAgain ? requestPerm() : Linking.openSettings())}
          style={{ marginTop: 22, alignSelf: 'stretch' }}
        />
        <Btn title={t('common.back')} kind="plain" onPress={() => router.back()} style={{ marginTop: 10, alignSelf: 'stretch' }} />
      </View>
    );
  }

  const take = async () => {
    try {
      haptic.tap();
      // full quality here: the only compression happens once, right before sending
      const pic = await cam.current?.takePictureAsync({ quality: 1 });
      if (pic?.uri) {
        setShot(pic.uri);
        setDims({ w: pic.width, h: pic.height });
      }
    } catch {
      Alert.alert(t('child.cam.failTitle'), t('child.cam.failText'));
    }
  };
  const send = async () => {
    if (!shot) return;
    setBusy(true);
    try {
      // One gentle pass: long side capped at 2048 px (handwriting stays sharp), JPEG 0.85 — about 300–600 KB.
      const ctx = ImageManipulator.manipulate(shot);
      const long = Math.max(dims?.w ?? 0, dims?.h ?? 0);
      if (long > MAX_SIDE) ctx.resize((dims?.w ?? 0) >= (dims?.h ?? 0) ? { width: MAX_SIDE } : { height: MAX_SIDE });
      const ref = await ctx.renderAsync();
      const out = await ref.saveAsync({ compress: 0.85, format: SaveFormat.JPEG });
      await api.photo(taskId, out.uri);
      haptic.success();
      setShot(null);
      if (page < 2) setSent(true);
      else router.back();
    } catch (e) {
      Alert.alert(t('child.cam.sendFailTitle'), (e as Error).message || t('child.cam.sendFailText'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.bg}>
      {shot ? (
        <Image source={{ uri: shot }} style={StyleSheet.absoluteFill} contentFit="contain" />
      ) : (
        <CameraView ref={cam} style={StyleSheet.absoluteFill} facing="back" enableTorch={torch} />
      )}
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.round}>
          <Txt v="headline" color="#fff">
            ✕
          </Txt>
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Txt v="headline" color="#fff" numberOfLines={1}>
            {params.emoji} {params.label}
          </Txt>
          <Txt v="sub" color="rgba(255,255,255,0.75)">
            {t('child.cam.page', { page })}
          </Txt>
        </View>
        {!shot ? (
          <Pressable onPress={() => setTorch((v) => !v)} hitSlop={12} style={[styles.round, torch && { backgroundColor: '#FDB241' }]}>
            <Text style={{ fontSize: 17 }}>🔦</Text>
          </Pressable>
        ) : (
          <View style={styles.round} />
        )}
      </View>
      {!shot && !sent ? (
        <View pointerEvents="none" style={styles.frame}>
          <View style={styles.frameBox} />
          <Txt v="sub" color="rgba(255,255,255,0.85)" style={{ marginTop: 10 }}>
            {t('child.cam.frame')}
          </Txt>
        </View>
      ) : null}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 18 }]}>
        {sent ? (
          <View style={{ gap: 10, alignSelf: 'stretch' }}>
            <Txt v="headline" color="#fff" style={{ textAlign: 'center' }}>
              {t('child.cam.sent')}
            </Txt>
            <Btn
              title={t('child.cam.page2')}
              icon="＋"
              onPress={() => {
                setSent(false);
                setPage(2);
              }}
            />
            <Btn title={t('common.done')} kind="plain" onPress={() => router.back()} />
          </View>
        ) : shot ? (
          <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch' }}>
            <Btn title={t('child.cam.retake')} kind="plain" onPress={() => setShot(null)} disabled={busy} style={{ flex: 1 }} />
            <Btn title={t('child.cam.send')} onPress={send} loading={busy} style={{ flex: 1 }} />
          </View>
        ) : (
          <Pressable onPress={take} accessibilityLabel={t('child.cam.shutter')} style={({ pressed }) => [styles.shutter, pressed && { transform: [{ scale: 0.92 }] }]}>
            <View style={styles.shutterInner} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 28 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 12, backgroundColor: 'rgba(0,0,0,0.35)' },
  round: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  frame: { position: 'absolute', top: '17%', left: '8%', right: '8%', bottom: '25%', alignItems: 'center' },
  frameBox: { flex: 1, alignSelf: 'stretch', borderRadius: 22, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)', borderStyle: 'dashed' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingHorizontal: 18, paddingTop: 18, backgroundColor: 'rgba(0,0,0,0.35)' },
  shutter: { width: 80, height: 80, borderRadius: 40, borderWidth: 5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#fff' },
});
