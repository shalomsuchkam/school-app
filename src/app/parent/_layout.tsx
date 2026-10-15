import { Redirect, Tabs } from 'expo-router';
import { Platform, StyleSheet, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { font, usePalette } from '@/lib/theme';

// Filled glyph for the selected tab, outline for the rest.
const icon = (name: IconName) =>
  function TabIcon({ focused, color }: { focused: boolean; color: ColorValue }) {
    return <Icon name={focused ? name : (`${name}-outline` as IconName)} size={24} color={color} />;
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
        tabBarLabelStyle: { fontFamily: font.extra, fontSize: 11, letterSpacing: 0.1, marginTop: Platform.OS === 'android' ? 0 : 1 },
        // the bar has a fixed height: labels stay at their designed size (iOS shows the large-content viewer instead)
        tabBarAllowFontScaling: false,
        tabBarStyle: {
          backgroundColor: p.bgElevated,
          borderTopColor: p.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          elevation: 0,
          shadowOpacity: 0,
          // a custom height replaces the default one entirely, so it must include the bottom (nav bar / home indicator) inset
          height: 56 + insets.bottom,
          paddingTop: 6,
        },
        sceneStyle: { backgroundColor: p.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('parent.tab.today'), tabBarIcon: icon('today') }} />
      <Tabs.Screen name="schedule" options={{ title: t('parent.tab.schedule'), tabBarIcon: icon('calendar') }} />
      <Tabs.Screen name="lists" options={{ title: t('parent.tab.lists'), tabBarIcon: icon('checkbox') }} />
      <Tabs.Screen name="settings" options={{ title: t('parent.tab.settings'), tabBarIcon: icon('settings') }} />
      {/* opened from Today; hidden from the tab bar so it keeps its 4 tabs */}
      <Tabs.Screen name="report" options={{ href: null, title: t('parent.report.title') }} />
    </Tabs>
  );
}
