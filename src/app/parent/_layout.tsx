import { Redirect, Tabs } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { font, usePalette } from '@/lib/theme';

const icon = (e: string) =>
  function TabIcon({ focused }: { focused: boolean }) {
    return <Text style={{ fontSize: 21, opacity: focused ? 1 : 0.45 }}>{e}</Text>;
  };

export default function ParentTabs() {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const t = useT();
  if (!session) return <Redirect href="/welcome" />;
  if (session.role !== 'parent') return <Redirect href="/child" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: p.brand,
        tabBarInactiveTintColor: p.muted,
        tabBarLabelStyle: { fontFamily: font.extra, fontSize: 11 },
        tabBarStyle: {
          backgroundColor: p.bgElevated,
          borderTopColor: p.line,
          borderTopWidth: StyleSheet.hairlineWidth,
          // a custom height replaces the default one entirely, so it must include the bottom (nav bar / home indicator) inset
          height: 56 + insets.bottom,
          paddingTop: 6,
        },
        sceneStyle: { backgroundColor: p.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('parent.tab.today'), tabBarIcon: icon('📋') }} />
      <Tabs.Screen name="schedule" options={{ title: t('parent.tab.schedule'), tabBarIcon: icon('🗓️') }} />
      <Tabs.Screen name="lists" options={{ title: t('parent.tab.lists'), tabBarIcon: icon('✅') }} />
      <Tabs.Screen name="settings" options={{ title: t('parent.tab.settings'), tabBarIcon: icon('⚙️') }} />
    </Tabs>
  );
}
