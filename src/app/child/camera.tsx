import { CameraView, useCameraPermissions } from 'expo-camera';
import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Btn, haptic, Icon, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';

// Live camera only: deliberately no gallery picker, so every photo is taken right now.
const MAX_SIDE = 2048;

// Photo quality heuristic (no extra native deps, no pixel decoding): re-encode a 512 px wide copy as
// JPEG 0.7 and look at its byte size per pixel. JPEG spends bytes on detail and edges, so a sharp,
// well-lit notebook page with handwriting lands around 0.12–0.3 B/px, while a nearly black frame or a
// heavy motion blur has almost no high-frequency content and collapses to ≲0.05 B/px. Below the
// threshold we only *warn* (retake / send anyway) — a nearly blank page can trigger it legitimately.
const PROBE_WIDTH = 512;
const MIN_BYTES_PER_PX = 0.05;
async function looksTooDarkOrBlurry(uri: string): Promise<boolean> {
  const ref = await ImageManipulator.manipulate(uri).resize({ width: PROBE_WIDTH }).renderAsync();
  const probe = await ref.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
  const file = new File(probe.uri);
  const bytes = file.size ?? 0;
  try {
    file.delete();
  } catch {}
  if (!bytes || !probe.width || !probe.height) return false;
  return bytes / (probe.width * probe.height) < MIN_BYTES_PER_PX;
}

export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // Landscape: the top and bottom bars eat more of the short side, so the frame shrinks to stay clear.
  const landscape = width > height;
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
  // Result of the quality probe, tied to the shot it was measured on (a retake drops it automatically).
  const [quality, setQuality] = useState<{ uri: string; low: boolean } | null>(null);
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
        const uri = pic.uri;
        setShot(uri);
        setDims({ w: pic.width, h: pic.height });
        looksTooDarkOrBlurry(uri)
          .then((low) => {
            setQuality({ uri, low });
            if (low) haptic.warn();
          })
          .catch(() => setQuality({ uri, low: false }));
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

  const checking = !!shot && quality?.uri !== shot;
  const low = !!shot && quality?.uri === shot && quality.low;

  return (
    <View style={styles.bg}>
      {shot ? (
        <Image source={{ uri: shot }} style={StyleSheet.absoluteFill} contentFit="contain" />
      ) : (
        <CameraView ref={cam} style={StyleSheet.absoluteFill} facing="back" enableTorch={torch} />
      )}
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.round} accessibilityRole="button" accessibilityLabel={t('common.close')}>
          <Icon name="close" size={24} color="#fff" />
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
          <Pressable
            onPress={() => setTorch((v) => !v)}
            hitSlop={12}
            accessibilityRole="switch"
            accessibilityState={{ checked: torch }}
            accessibilityLabel={t('child.cam.torch')}
            style={[styles.round, torch && { backgroundColor: '#FDB241' }]}
          >
            <Icon name={torch ? 'flashlight' : 'flashlight-outline'} size={21} color={torch ? '#1A1300' : '#fff'} />
          </Pressable>
        ) : (
          <View style={styles.round} />
        )}
      </View>
      {!shot && !sent ? (
        // Document frame: corner brackets + a plain-language hint. Percent insets keep it right on
        // phones, tablets and in landscape; the hint sits in a pill so it reads on any background.
        <View pointerEvents="none" style={[styles.frame, landscape && styles.frameLand]}>
          <View style={styles.frameBox}>
            <View style={[styles.corner, styles.tl]} />
            <View style={[styles.corner, styles.tr]} />
            <View style={[styles.corner, styles.bl]} />
            <View style={[styles.corner, styles.br]} />
          </View>
          <View style={styles.hint}>
            <Txt v="callout" color="#fff" style={{ textAlign: 'center' }}>
              📒 {t('child.cam.frameHint')}
            </Txt>
          </View>
        </View>
      ) : null}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 18 }]}>
        {sent ? (
          <View style={{ gap: 10, alignSelf: 'stretch', width: '100%', maxWidth: 560 }}>
            <Txt v="headline" color="#fff" style={{ textAlign: 'center' }}>
              {t('child.cam.sent')}
            </Txt>
            <Btn
              title={t('child.cam.page2')}
              icon="add"
              onPress={() => {
                setSent(false);
                setPage(2);
              }}
            />
            <Btn title={t('common.done')} kind="plain" onPress={() => router.back()} />
          </View>
        ) : shot ? (
          <View style={{ gap: 12, alignSelf: 'stretch', width: '100%', maxWidth: 560 }}>
            {low ? (
              <View style={styles.warn} accessibilityLiveRegion="polite">
                <Txt v="headline" color="#fff">
                  🤔 {t('child.cam.lowTitle')}
                </Txt>
                <Txt v="callout" color="rgba(255,255,255,0.85)" style={{ marginTop: 4 }}>
                  {t('child.cam.lowText')}
                </Txt>
              </View>
            ) : (
              <Txt v="callout" color="rgba(255,255,255,0.85)" style={{ textAlign: 'center' }}>
                {checking ? t('child.cam.checking') : t('child.cam.looksGood')}
              </Txt>
            )}
            {low ? (
              <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                <Btn title={t('child.cam.retake')} icon="camera" onPress={() => setShot(null)} disabled={busy} style={{ flexGrow: 1, flexBasis: 140 }} />
                <Btn title={t('child.cam.sendAnyway')} kind="plain" onPress={send} loading={busy} style={{ flexGrow: 1, flexBasis: 140 }} />
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Btn title={t('child.cam.retake')} kind="plain" onPress={() => setShot(null)} disabled={busy} style={{ flex: 1 }} />
                <Btn title={t('child.cam.send')} onPress={send} loading={busy} style={{ flex: 1 }} />
              </View>
            )}
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
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  frame: { position: 'absolute', top: '16%', left: '8%', right: '8%', bottom: '24%', alignItems: 'center' },
  frameLand: { top: '22%', bottom: '36%', left: '20%', right: '20%' },
  frameBox: { flex: 1, alignSelf: 'stretch', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  corner: { position: 'absolute', width: 34, height: 34, borderColor: '#fff' },
  tl: { top: -2, left: -2, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 18 },
  tr: { top: -2, right: -2, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 18 },
  bl: { bottom: -2, left: -2, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 18 },
  br: { bottom: -2, right: -2, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 18 },
  hint: { marginTop: 10, maxWidth: 480, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: 'rgba(0,0,0,0.55)' },
  warn: { borderRadius: 16, padding: 14, backgroundColor: 'rgba(230,138,0,0.92)' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingHorizontal: 18, paddingTop: 18, backgroundColor: 'rgba(0,0,0,0.35)' },
  shutter: { width: 80, height: 80, borderRadius: 40, borderWidth: 5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#fff' },
});
