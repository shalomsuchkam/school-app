import { Redirect, Tabs } from 'expo-router';
import { Platform, StyleSheet, Text } from 'react-native';

import { useAuth } from '@/lib/auth';
import { font, usePalette } from '@/lib/theme';

const icon = (e: string) =>
  function TabIcon({ focused }: { focused: boolean }) {
    return <Text style={{ fontSize: 21, opacity: focused ? 1 : 0.45 }}>{e}</Text>;
  };

export default function ParentTabs() {
  const p = usePalette();
  const { session } = useAuth();
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
          height: Platform.OS === 'ios' ? 86 : 66,
          paddingTop: 6,
        },
        sceneStyle: { backgroundColor: p.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Сегодня', tabBarIcon: icon('📋') }} />
      <Tabs.Screen name="schedule" options={{ title: 'Расписание', tabBarIcon: icon('🗓️') }} />
      <Tabs.Screen name="lists" options={{ title: 'Дела', tabBarIcon: icon('✅') }} />
      <Tabs.Screen name="settings" options={{ title: 'Настройки', tabBarIcon: icon('⚙️') }} />
    </Tabs>
  );
}
