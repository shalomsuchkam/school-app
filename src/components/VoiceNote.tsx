import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from 'expo-audio';
import { useEffect, useEffectEvent, useState } from 'react';
import { Alert, Linking, Platform, StyleSheet, View } from 'react-native';

import { api, type Task } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { radius, space, usePalette } from '@/lib/theme';

import { Btn, haptic, Icon, PressableScale, ProgressBar, Sheet, Txt } from './ui';

export const VOICE_MAX_S = 60;

// AAC in an MP4 container (.m4a), mono 64 kbit/s: a minute is ~0.5 MB, well under the server's 2 MB.
const OPTIONS: RecordingOptions = { ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64000, sampleRate: 44100 };

/** Recording a voice note needs the microphone (and an .m4a recorder): phones only, not the web preview. */
export const canRecordVoice = Platform.OS !== 'web';

/** 0:07 / 1:00 */
export const clock = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Small play / pause control with the duration; no waveform. The source loads on the first tap
 * (signed links rotate with every refresh, so nothing is fetched for cards nobody plays).
 */
export function VoicePlayer({ url, compact }: { url: string; compact?: boolean }) {
  const p = usePalette();
  const t = useT();
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [loaded, setLoaded] = useState<string | null>(null);
  const playing = status.playing;
  const toggle = async () => {
    haptic.tap();
    if (playing) return player.pause();
    try {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    } catch {}
    if (loaded !== url && !(loaded && status.isLoaded && status.currentTime > 0 && status.currentTime < status.duration)) {
      player.replace({ uri: url });
      setLoaded(url);
    } else if (status.duration && status.currentTime >= status.duration - 0.25) {
      await player.seekTo(0).catch(() => {});
    }
    player.play();
  };
  const dur = status.duration > 0 ? status.duration : 0;
  const label = dur ? (playing || status.currentTime > 0 ? `${clock(status.currentTime)} / ${clock(dur)}` : clock(dur)) : t('common.voice.label');
  return (
    <View style={[styles.player, { backgroundColor: p.brandSoft }, compact && { alignSelf: 'flex-start' }]}>
      <PressableScale
        onPress={toggle}
        hitSlop={6}
        scaleTo={0.9}
        accessibilityRole="button"
        accessibilityLabel={playing ? t('common.voice.pause') : t('common.voice.play')}
        style={[styles.play, { backgroundColor: p.brandFill }]}
      >
        <Icon name={playing ? 'pause' : 'play'} size={16} color="#fff" style={playing ? undefined : { marginLeft: 2 }} />
      </PressableScale>
      <View style={{ flex: compact ? 0 : 1, minWidth: 64, gap: 4 }}>
        <View style={styles.row}>
          <Icon name="mic" size={14} color={p.brand} />
          <Txt v="sub" color={p.brand} style={{ fontWeight: '600', fontVariant: ['tabular-nums'] }} numberOfLines={1}>
            {label}
          </Txt>
        </View>
        {!compact && dur ? <ProgressBar value={status.currentTime / dur} height={4} track={p.card} /> : null}
      </View>
    </View>
  );
}

type Phase = 'idle' | 'recording' | 'recorded' | 'sending' | 'failed';

/** The child's voice note for one task: tap to record (up to 60 s), listen back, send. */
export function VoiceSheet({ task, onClose, onSent }: { task: Task | null; onClose: () => void; onSent: () => void }) {
  const t = useT();
  return (
    <Sheet visible={!!task} title={t('child.voice.title')} onClose={onClose}>
      {/* the recorder exists only while the sheet is open */}
      {task ? <Recorder task={task} onSent={onSent} /> : null}
    </Sheet>
  );
}

function Recorder({ task, onSent }: { task: Task; onSent: () => void }) {
  const p = usePalette();
  const t = useT();
  const recorder = useAudioRecorder(OPTIONS);
  const rec = useAudioRecorderState(recorder, 250);
  const [phase, setPhase] = useState<Phase>('idle');
  const [uri, setUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const secs = rec.durationMillis / 1000;

  const stop = async () => {
    try {
      await recorder.stop();
    } catch {}
    setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    const u = recorder.uri ?? rec.url;
    if (u) {
      setUri(u);
      setPhase('recorded');
      haptic.success();
    } else {
      setPhase('idle');
      setError(t('child.voice.readFail'));
    }
  };
  // the 60-second cap (the recorder also stops itself via forDuration) and a stop by the system (a call came in)
  const onTick = useEffectEvent(() => {
    const st = recorder.getStatus();
    if (st.durationMillis >= VOICE_MAX_S * 1000 || (!st.isRecording && st.durationMillis > 0)) stop();
  });
  useEffect(() => {
    if (phase !== 'recording') return;
    const id = setInterval(onTick, 250);
    return () => clearInterval(id);
  }, [phase]);

  const start = async () => {
    setError(null);
    const perm = await requestRecordingPermissionsAsync().catch(() => null);
    if (!perm?.granted) {
      Alert.alert(t('child.voice.permTitle'), t('child.voice.permText'), [
        { text: t('common.cancel'), style: 'cancel' },
        ...(perm && !perm.canAskAgain ? [{ text: t('child.voice.openSettings'), onPress: () => Linking.openSettings().catch(() => {}) }] : []),
      ]);
      return;
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: VOICE_MAX_S });
      haptic.tap();
      setUri(null);
      setPhase('recording');
    } catch (e) {
      setError((e as Error).message || t('child.voice.readFail'));
    }
  };
  const send = async () => {
    if (!uri) return;
    setPhase('sending');
    setError(null);
    try {
      await api.voice(task.id, uri);
      haptic.success();
      onSent();
    } catch (e) {
      setPhase('failed');
      setError((e as Error).message);
    }
  };

  const recording = phase === 'recording';
  return (
    <View style={{ gap: space.s }}>
      <Txt v="callout" color={p.muted}>
        {task.emoji} {task.label} · {t('child.voice.hint')}
      </Txt>
      <View style={styles.center}>
        <PressableScale
          onPress={recording ? stop : start}
          disabled={phase === 'sending'}
          scaleTo={0.92}
          accessibilityRole="button"
          accessibilityLabel={recording ? t('child.voice.stop') : uri ? t('child.voice.again') : t('child.voice.start')}
          style={[styles.mic, { backgroundColor: recording ? p.badFill : p.brandFill }]}
        >
          <Icon name={recording ? 'stop' : 'mic'} size={34} color="#fff" />
        </PressableScale>
        <Txt v="headline" color={recording ? p.bad : p.ink} style={{ fontVariant: ['tabular-nums'] }} accessibilityLiveRegion="polite">
          {recording ? t('child.voice.recording', { time: clock(secs) }) : uri ? t('child.voice.again') : t('child.voice.start')}
        </Txt>
        <Txt v="sub" color={p.muted}>
          {t('child.voice.max', { n: VOICE_MAX_S })}
        </Txt>
        {recording ? <ProgressBar value={secs / VOICE_MAX_S} color={p.bad} style={{ alignSelf: 'stretch' }} /> : null}
      </View>
      {uri && !recording ? <VoicePlayer url={uri} /> : null}
      {error ? (
        <Txt v="callout" color={p.bad} accessibilityLiveRegion="polite">
          {phase === 'failed' ? t('child.voice.fail', { error }) : error}
        </Txt>
      ) : null}
      {uri && !recording ? (
        <Btn
          title={phase === 'failed' ? t('child.voice.retry') : t('child.voice.send')}
          icon={phase === 'failed' ? 'refresh' : 'send'}
          loading={phase === 'sending'}
          onPress={send}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  player: { flexDirection: 'row', alignItems: 'center', gap: space.xs, borderRadius: radius.m, paddingVertical: 6, paddingLeft: 6, paddingRight: space.s, marginTop: space.s },
  play: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  center: { alignItems: 'center', gap: space.xs, paddingVertical: space.s },
  mic: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
});
