import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { api } from './api';

// Server push (parent alerts, "Напомнить ученику", approvals) goes through the Expo push service.
// It works once the build has an EAS project id (and FCM on Android); until then this is a no-op
// and the child still gets local reminders scheduled on the phone.
let sent: string | null = null;

export async function registerPush(ask: boolean) {
  if (Platform.OS === 'web') return;
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  if (!projectId) return;
  let perm = await Notifications.getPermissionsAsync();
  if (!perm.granted && ask && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) return;
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  if (data && data !== sent) {
    await api.pushToken(data);
    sent = data;
  }
}
