import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Btn, Field, haptic, IconBtn, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { CODE_LEN, codeFromLink, codeFromParam, normalizeCode } from '@/lib/invite';
import { tn, useT } from '@/lib/i18n';
import { radius, space, usePalette } from '@/lib/theme';

const LEN = CODE_LEN;
const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });
const MAX_W = 560;
const SLOTS = Array.from({ length: LEN }, (_, i) => i);
// typed or pasted: a whole invite link / shared message is reduced to its code
const normalize = (v: string) => (v.length > LEN ? (codeFromLink(v) ?? normalizeCode(v)) : normalizeCode(v));

export default function Join() {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { session, signIn } = useAuth();
  // uroki://join?code=K7QMZP (invite link / QR code) opens this screen with the code filled in,
  // both on a cold start and while the app is running (the param then changes on this screen)
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const linked = codeFromParam(params.code);
  const [code, setCode] = useState(linked ?? '');
  const [seenLink, setSeenLink] = useState(linked);
  if (linked !== seenLink) {
    setSeenLink(linked);
    if (linked) setCode(linked);
  }
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const input = useRef<TextInput>(null);
  const shake = useSharedValue(0);
  const reduce = useReducedMotion();
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.get() }] }));
  // Already signed in (e.g. reached via back navigation): go home instead of joining again.
  if (session && !joined) return <Redirect href={session.role === 'child' ? '/child' : '/parent'} />;
  const clean = normalize(code);
  const complete = clean.length === LEN;

  const submit = async () => {
    if (!complete || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.join(clean, name.trim());
      setJoined(true);
      await signIn(r);
      // Drop welcome/join from history so Back can't return to them.
      if (router.canDismiss()) router.dismissAll();
      router.replace(r.role === 'child' ? '/child' : '/parent');
    } catch (e) {
      setError((e as Error).message);
      haptic.warn();
      // a head-shake says "wrong" without words; Reduce Motion keeps the red boxes and the message only
      if (!reduce)
        shake.set(
          withSequence(
            withTiming(-10, { duration: 50 }),
            withTiming(10, { duration: 70 }),
            withTiming(-6, { duration: 60 }),
            withTiming(6, { duration: 60 }),
            withTiming(0, { duration: 50 }),
          ),
        );
    } finally {
      setBusy(false);
    }
  };

  const borderFor = (i: number) => {
    if (error) return p.bad;
    if (focused && (i === clean.length || (complete && i === LEN - 1))) return p.brand;
    if (complete) return p.ok;
    return i < clean.length ? p.ink2 : p.border;
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: p.bg }} behavior="padding">
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingTop: insets.top + 10 }} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <IconBtn icon="←" label={t('common.back')} onPress={() => router.back()} />
          <Txt v="largeTitle" accessibilityRole="header" style={{ marginTop: 18 }}>
            {t('onboarding.join.title')}
          </Txt>
          <Txt v="callout" color={p.muted} style={{ marginTop: 6 }}>
            {t('onboarding.join.hint')}
          </Txt>

          <Txt v="sub" color={p.ink2} style={{ marginTop: space.l, marginBottom: space.xs, fontWeight: '600' }}>
            {t('onboarding.join.codeLabel')}
          </Txt>
          <Animated.View style={shakeStyle}>
            <Pressable onPress={() => input.current?.focus()} accessible={false} style={styles.boxes}>
              {SLOTS.map((i) => {
                const ch = clean[i];
                return (
                  <View
                    key={i}
                    style={[
                      styles.box,
                      {
                        borderColor: borderFor(i),
                        backgroundColor: error ? p.badSoft : complete ? p.okSoft : p.card,
                        borderWidth: focused && (i === clean.length || (complete && i === LEN - 1)) ? 2 : 1.5,
                        marginRight: i === 2 ? 10 : 0, // visual split 3 + 3
                      },
                    ]}
                  >
                    <Txt v="largeTitle" color={error ? p.bad : p.ink} style={[styles.char, { fontFamily: MONO }]}>
                      {ch ?? ''}
                    </Txt>
                  </View>
                );
              })}
              {/* The real input sits invisibly over the boxes: native typing, paste and keyboard handling. */}
              <TextInput
                ref={input}
                value={clean}
                onChangeText={(v) => {
                  setCode(normalize(v));
                  if (error) setError(null);
                }}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onSubmitEditing={submit}
                // a linked code is complete: the name field is what's left to fill in
                autoFocus={!linked}
                autoCapitalize="characters"
                autoCorrect={false}
                autoComplete="off"
                spellCheck={false}
                keyboardType={Platform.OS === 'android' ? 'visible-password' : 'default'}
                returnKeyType="go"
                maxLength={200}
                caretHidden
                accessibilityLabel={t('onboarding.join.codeA11y', { n: clean.length })}
                style={styles.hidden}
              />
            </Pressable>
          </Animated.View>

          <View style={styles.status}>
            {error ? (
              <>
                <Ionicons name="alert-circle" size={18} color={p.bad} />
                <Txt v="callout" color={p.bad} style={{ flex: 1 }} accessibilityLiveRegion="polite">
                  {error}
                </Txt>
              </>
            ) : complete ? (
              <>
                <Ionicons name="checkmark-circle" size={18} color={p.ok} />
                <Txt v="callout" color={p.ok}>
                  {t('onboarding.join.ready')}
                </Txt>
              </>
            ) : (
              <Txt v="sub" color={p.muted}>
                {tn('onboarding.join.left', LEN - clean.length)}
              </Txt>
            )}
          </View>

          <Field label={t('onboarding.join.name')} value={name} onChangeText={setName} placeholder={t('onboarding.join.namePh')} maxLength={30} returnKeyType="go" onSubmitEditing={submit} />
        </View>
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: insets.bottom + 16 }}>
        <View style={styles.column}>
          <Btn title={t('onboarding.join.submit')} onPress={submit} loading={busy} disabled={!complete} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  column: { width: '100%', maxWidth: MAX_W, alignSelf: 'center' },
  boxes: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  box: { flex: 1, maxWidth: 60, aspectRatio: 0.8, borderRadius: radius.s + 2, alignItems: 'center', justifyContent: 'center' },
  char: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: 0, textAlign: 'center' },
  hidden: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.015, color: 'transparent', fontSize: 1 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 24, marginTop: 12, marginBottom: 14 },
});
