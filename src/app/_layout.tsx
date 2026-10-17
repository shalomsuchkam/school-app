import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { isViewer, setTooOldHandler } from '@/lib/api';
import { initAppearance, refreshAppearance } from '@/lib/appearance';
import { AuthProvider, useAuth } from '@/lib/auth';
import { initLang, t, useLang } from '@/lib/i18n';
import { registerPush } from '@/lib/push';
import { palettes, usePalette, useScheme } from '@/lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

// The server says this build is too old (x-min-build): ask once per launch to update from the store.
let askedUpdate = false;
setTooOldHandler(() => {
  if (askedUpdate) return;
  askedUpdate = true;
  // EXPO_PUBLIC_IOS_APP_ID is known after the App Store listing is created
  const iosId = process.env.EXPO_PUBLIC_IOS_APP_ID;
  const url = Platform.OS === 'ios' ? (iosId ? `https://apps.apple.com/app/id${iosId}` : 'https://apps.apple.com/') : 'market://details?id=kz.uroki.app';
  Alert.alert(t('common.updateTitle'), t('common.updateText'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('common.update'), onPress: () => Linking.openURL(url).catch(() => {}) },
  ]);
});

function Root() {
  const { session } = useAuth();
  const p = usePalette();
  const [langReady, setLangReady] = useState(false);
  useEffect(() => {
    // language and the per-device appearance (theme mode, large text) are read before the splash hides
    Promise.all([initLang(), initAppearance()]).finally(() => setLangReady(true));
    // "by schedule" flips at 07:00 / 20:00: re-check when the app comes back to the foreground
    const sub = AppState.addEventListener('change', (st) => st === 'active' && refreshAppearance());
    return () => sub.remove();
  }, []);
  // the whole tree re-renders in the new language when it is switched in Settings
  const lang = useLang();
  // the platform font (SF / Roboto) needs no loading: the splash only waits for the language and the session
  const ready = langReady && session !== undefined;
  // Register this phone for server push once signed in (parents are asked for permission here;
  // the child is asked on the home screen together with local reminders).
  useEffect(() => {
    // viewers (tutors) get no push from the server (POST /push answers 403): don't register them
    if (session && !isViewer(session.role)) registerPush(session.role === 'parent').catch(() => {});
  }, [session]);
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  if (!ready) return null;
  return (
    <Stack key={lang} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.bg }, animation: 'fade' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="welcome" />
      <Stack.Screen name="join" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="onboarding" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="child/index" />
      <Stack.Screen name="child/camera" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="parent" />
    </Stack>
  );
}

// Navigation chrome (headers, back swipes, modals) in the app's paper / ink palette.
const LightNav = { ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: palettes.light.brand, background: palettes.light.bg, card: palettes.light.bgElevated, text: palettes.light.ink, border: palettes.light.line } };
const DarkNav = { ...DarkTheme, colors: { ...DarkTheme.colors, primary: palettes.dark.brand, background: palettes.dark.bg, card: palettes.dark.bgElevated, text: palettes.dark.ink, border: palettes.dark.line } };

export default function RootLayout() {
  const scheme = useScheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <ThemeProvider value={scheme === 'dark' ? DarkNav : LightNav}>
            <AuthProvider>
              <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
              <Root />
            </AuthProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
