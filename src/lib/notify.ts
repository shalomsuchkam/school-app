import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { isDone, type ChildState } from './api';
import { fromMin, toMin } from './format';

// Local reminders scheduled on the phone: they work offline and need no push service.
const supported = Platform.OS !== 'web';
if (supported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}
const CHANNEL = 'reminders';

export async function notificationsAllowed(ask: boolean): Promise<boolean> {
  if (!supported) return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Напоминания об уроках',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
      lightColor: '#6355F5',
    });
  }
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted || !ask) return cur.granted;
  return (await Notifications.requestPermissionsAsync()).granted;
}

export async function scheduleReminders(s: ChildState) {
  if (!supported) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  const left = s.tasks.filter((t) => t.required && !isDone(t));
  if (!left.length) return;
  const names = left.map((t) => t.label).join(', ');
  const [y, mo, d] = s.due_date.split('-').map(Number);
  const slots = [
    ...s.remind_times.map((t) => ({ m: toMin(t), title: '📚 Пора за уроки', body: `Осталось: ${names}` })),
    { m: toMin(s.soft) - 30, title: '⏳ Полчаса до срока', body: `До ${s.soft} осталось 30 минут. Осталось: ${names}` },
    { m: toMin(s.soft), title: `⏰ ${s.soft} — срок вышел`, body: 'Родители получили отчёт. Доделай и отметь!' },
    { m: toMin(s.hard) - 60, title: '🔴 Остался час', body: `В ${s.hard} последний срок` },
  ];
  const seen = new Set<number>();
  for (const sl of slots) {
    if (seen.has(sl.m) || sl.m <= 0 || sl.m >= 1440) continue;
    seen.add(sl.m);
    const [h, mi] = fromMin(sl.m).split(':').map(Number);
    const when = new Date(y, mo - 1, d, h, mi, 0);
    if (when.getTime() < Date.now() + 60_000) continue;
    await Notifications.scheduleNotificationAsync({
      content: { title: sl.title, body: sl.body, sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId: CHANNEL },
    });
  }
}

export async function cancelReminders() {
  if (supported) await Notifications.cancelAllScheduledNotificationsAsync();
}
