import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { isDone, type ChildState } from './api';
import { fromMin, toMin } from './format';
import { exactAlarmsAllowed } from './exactAlarm';
import { t } from './i18n';
import { inQuiet, type Quiet } from './quiet';

// Local reminders scheduled on the phone: they work offline and need no push service.
const supported = Platform.OS !== 'web';
if (supported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}
const CHANNEL = 'reminders';
const MAX_PENDING = 60; // iOS keeps at most 64 pending local notifications per app

export async function notificationsAllowed(ask: boolean): Promise<boolean> {
  if (!supported) return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: t('child.rem.channel'),
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
      lightColor: '#2A4BB0',
    });
  }
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted || !ask) return cur.granted;
  return (await Notifications.requestPermissionsAsync()).granted;
}

// ---------- family-timezone wall clock -> absolute instant ----------
const fmts = new Map<string, Intl.DateTimeFormat>();
function tzOffset(t: number, tz: string) {
  let f = fmts.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    fmts.set(tz, f);
  }
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(new Date(t))) p[x.type] = x.value;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  if (Number.isNaN(asUtc)) throw new Error('bad tz');
  return asUtc - Math.floor(t / 1000) * 1000;
}
// 'YYYY-MM-DD' + minutes since midnight as wall time in `tz`; falls back to the phone's own zone.
function zonedDate(iso: string, min: number, tz: string) {
  const [y, mo, d] = iso.split('-').map(Number);
  const [h, mi] = fromMin(min).split(':').map(Number);
  try {
    const guess = Date.UTC(y, mo - 1, d, h, mi);
    const off = tzOffset(guess, tz);
    let at = guess - off;
    const off2 = tzOffset(at, tz);
    if (off2 !== off) at = guess - off2;
    return new Date(at);
  } catch {
    return new Date(y, mo - 1, d, h, mi, 0);
  }
}

type Slot = { id: string; at: number; title: string; body: string };
export function daySlots(s: ChildState, due: string, names: string | null, quiet?: Quiet): Slot[] {
  const list = [
    ...s.remind_times.map((hm) => ({ m: toMin(hm), title: t('child.rem.timeTitle'), body: names ? t('child.rem.left', { names }) : t('child.rem.generic') })),
    { m: toMin(s.soft) - 30, title: t('child.rem.halfTitle'), body: names ? t('child.rem.halfLeft', { soft: s.soft, names }) : t('child.rem.halfAll', { soft: s.soft }) },
    { m: toMin(s.soft), title: t('child.rem.softTitle', { soft: s.soft }), body: names ? t('child.rem.softLeft') : t('child.rem.softAll') },
    { m: toMin(s.hard) - 60, title: t('child.rem.hourTitle'), body: t('child.rem.hourBody', { hard: s.hard }) },
  ];
  const seen = new Set<number>();
  const out: Slot[] = [];
  for (const sl of list) {
    // quiet hours: the server would not push then either, and a skipped reminder is not sent later
    if (seen.has(sl.m) || sl.m <= 0 || sl.m >= 1440 || inQuiet(sl.m, quiet)) continue;
    seen.add(sl.m);
    out.push({ id: `rem-${due}-${fromMin(sl.m)}`, at: zonedDate(due, sl.m, s.tz || 'Asia/Almaty').getTime(), title: sl.title, body: sl.body });
  }
  return out;
}

async function sync(s: ChildState | null, quiet: Quiet) {
  const now = Date.now();
  const wanted = new Map<string, Slot>();
  if (s) {
    const left = s.tasks.filter((x) => x.required && !isDone(x));
    // The current due day lists what is left (nothing once all is done); later days get generic text.
    const all = left.length ? daySlots(s, s.due_date, left.map((x) => x.label).join(', '), quiet) : [];
    for (const u of s.upcoming ?? []) if (u.due_date !== s.due_date) all.push(...daySlots(s, u.due_date, null, quiet));
    all
      .filter((sl) => sl.at > now)
      .sort((a, b) => a.at - b.at)
      .slice(0, MAX_PENDING)
      .forEach((sl) => wanted.set(sl.id, sl));
  }
  // Reminders set while exact alarms were off are inexact; re-set them once the permission changes.
  const ex = exactAlarmsAllowed();
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  const have = new Map(existing.map((r) => [r.identifier, r]));
  for (const r of existing) {
    if (!wanted.has(r.identifier)) await Notifications.cancelScheduledNotificationAsync(r.identifier);
  }
  for (const sl of wanted.values()) {
    const cur = have.get(sl.id);
    const soon = sl.at < now + 60_000;
    if (cur) {
      const same = cur.content.title === sl.title && cur.content.body === sl.body && Number(cur.content.data?.at) === sl.at && cur.content.data?.ex === ex;
      // An imminent reminder is left alone, so a refresh never drops it right before it fires.
      if (same || soon) continue;
      await Notifications.cancelScheduledNotificationAsync(sl.id);
    } else if (sl.at < now + 2000) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: sl.id,
      content: { title: sl.title, body: sl.body, sound: true, data: { at: sl.at, ex } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: sl.at, channelId: CHANNEL },
    });
  }
}

// One run at a time: overlapping refreshes (focus, poll, app resume) never interleave.
let queue: Promise<unknown> = Promise.resolve();
function enqueue(s: ChildState | null, quiet: Quiet = null) {
  const run = queue.then(() => sync(s, quiet));
  queue = run.catch(() => {});
  return run;
}

// quiet: the family's quiet hours (GET /me → family.quiet_from / quiet_to); reminders inside are skipped.
export async function scheduleReminders(s: ChildState, quiet?: Quiet) {
  if (supported) await enqueue(s, quiet);
}

export async function cancelReminders() {
  if (supported) await enqueue(null);
}
