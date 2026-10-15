import { Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black, useFonts } from '@expo-google-fonts/nunito';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Alert, Linking, Platform, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setTooOldHandler } from '@/lib/api';
import { AuthProvider, useAuth } from '@/lib/auth';
import { initLang, t, useLang } from '@/lib/i18n';
import { registerPush } from '@/lib/push';
import { usePalette } from '@/lib/theme';

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
  const [fontsLoaded] = useFonts({ Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black });
  const [langReady, setLangReady] = useState(false);
  useEffect(() => {
    initLang().finally(() => setLangReady(true));
  }, []);
  // the whole tree re-renders in the new language when it is switched in Settings
  const lang = useLang();
  const ready = fontsLoaded && langReady && session !== undefined;
  // Register this phone for server push once signed in (parents are asked for permission here;
  // the child is asked on the home screen together with local reminders).
  useEffect(() => {
    if (session) registerPush(session.role === 'parent').catch(() => {});
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

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
            <AuthProvider>
              <StatusBar style="auto" />
              <Root />
            </AuthProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
