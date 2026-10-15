import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Btn, Field, IconBtn, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { radius, type, usePalette } from '@/lib/theme';

export default function Join() {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { session, signIn } = useAuth();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Already signed in (e.g. reached via back navigation): go home instead of joining again.
  if (session && !joined) return <Redirect href={session.role === 'child' ? '/child' : '/parent'} />;
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '');

  const submit = async () => {
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
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: p.bg }} behavior="padding">
      <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: insets.top + 10 }}>
        <IconBtn icon="←" label={t('common.back')} onPress={() => router.back()} />
        <Txt v="largeTitle" style={{ marginTop: 18 }}>
          {t('onboarding.join.title')}
        </Txt>
        <Txt v="callout" color={p.muted} style={{ marginTop: 6 }}>
          {t('onboarding.join.hint')}
        </Txt>
        <TextInput
          value={clean}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          placeholder="ABC123"
          placeholderTextColor={p.line}
          style={[type.largeTitle, styles.code, { color: p.ink, backgroundColor: p.card, borderColor: clean.length === 6 ? p.brand : p.line }]}
        />
        <Field label={t('onboarding.join.name')} value={name} onChangeText={setName} placeholder={t('onboarding.join.namePh')} maxLength={30} />
        {error ? (
          <Txt v="callout" color={p.bad}>
            {error}
          </Txt>
        ) : null}
      </View>
      <View style={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 16 }}>
        <Btn title={t('onboarding.join.submit')} onPress={submit} loading={busy} disabled={clean.length !== 6} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  code: { marginTop: 24, marginBottom: 20, textAlign: 'center', letterSpacing: 10, borderRadius: radius.l, borderWidth: 2, paddingVertical: 18 },
});
