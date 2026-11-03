import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { api } from './api';

// Loaded by the root layout for both roles. A handler installed only by the
// child's reminder screen leaves foreground parent alerts silently hidden.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

// Server push (parent alerts, "Напомнить ученику", approvals) goes through the Expo push service.
// It works once the build has an EAS project id (and FCM on Android); until then this is a no-op
// and the child still gets local reminders scheduled on the phone.
export async function registerPush(ask: boolean) {
  if (Platform.OS === 'web') return;
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  if (!projectId) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Контроль ДЗ', importance: Notifications.AndroidImportance.DEFAULT });
  }
  let perm = await Notifications.getPermissionsAsync();
  if (!perm.granted && ask && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) return;
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  // Registration belongs to the current family session, not just this installation.
  // Re-send on every sign-in: an unchanged device token may now belong to a different family.
  if (data) {
    await api.pushToken(data);
  }
}
