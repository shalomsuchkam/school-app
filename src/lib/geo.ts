import * as BackgroundFetch from 'expo-background-fetch';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { API_BASE } from './api';
import { readSessionToken } from './sessionStore';
import { storage } from './storage';

// Child location tracking (docs/LOCATION.md). The child's phone reports its position to the server on a background
// schedule; the parent sees the latest point and gets a push the moment the child turns location off or revokes
// the permission. A normal (non-managed) Android phone cannot be *prevented* from turning the master switch off, so
// the design is: keep reporting whenever possible (a foreground service survives the app being swiped away), and
// the moment reporting shows services/permission went away, the server tells the parent. Two background tasks:
//   • LOCATION_TASK  — expo-location delivers fresh fixes (dense while moving) to a foreground service.
//   • HEARTBEAT_TASK — a periodic wake-up that reports even when the phone is still, and crucially catches the case
//                      where the child switched location OFF (then no fix arrives, but the heartbeat still pings).
export const LOCATION_TASK = 'uroki-location';
export const HEARTBEAT_TASK = 'uroki-location-heartbeat';

// Persisted desire to track, so a relaunch/boot can resume without waiting for the first /child/state.
const WANT_KEY = 'uroki.geo.want.v1';

type Perm = 'always' | 'while' | 'denied' | 'unknown';

const tracked = Platform.OS === 'android' || Platform.OS === 'ios';

// --- permission snapshot, mapped to the server's perm field ---
async function currentPerm(): Promise<Perm> {
  try {
    const fg = await Location.getForegroundPermissionsAsync();
    if (!fg.granted) return 'denied';
    const bg = await Location.getBackgroundPermissionsAsync();
    return bg.granted ? 'always' : 'while';
  } catch {
    return 'unknown';
  }
}

// POST one ping. Reads the token directly from storage so it works in a headless background task, where the api.ts
// module-level token may be unset. Never throws — a failed ping is retried on the next schedule.
async function postPing(p: { lat: number | null; lng: number | null; accuracy: number | null; at: string | null; moving: boolean }) {
  try {
    // read only (SecureStore, else its mirror): a headless task never restores or rewrites the session
    const token = await readSessionToken();
    if (!token) return;
    const [services_on, perm] = await Promise.all([
      Location.hasServicesEnabledAsync().catch(() => true),
      currentPerm(),
    ]);
    await fetch(API_BASE + '/child/location', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'x-platform': Platform.OS },
      body: JSON.stringify({ ...p, services_on, perm }),
    });
  } catch {
    // offline or server down: next schedule retries
  }
}

// --- background task: fresh fixes from the foreground service ---
if (tracked && !TaskManager.isTaskDefined(LOCATION_TASK)) {
  TaskManager.defineTask(LOCATION_TASK, async ({ data, error }: any) => {
    if (error || !data?.locations?.length) {
      // a delivery with no fix still tells the server we're alive and whether services/permission changed
      await postPing({ lat: null, lng: null, accuracy: null, at: null, moving: false });
      return;
    }
    const loc = data.locations[data.locations.length - 1];
    await postPing({
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      accuracy: loc.coords.accuracy ?? null,
      at: new Date(loc.timestamp).toISOString(),
      moving: (loc.coords.speed ?? 0) > 1.2, // ~4 km/h: walking or faster
    });
  });
}

// --- heartbeat: periodic wake-up that pings even when stationary, and when location was switched off ---
if (tracked && !TaskManager.isTaskDefined(HEARTBEAT_TASK)) {
  TaskManager.defineTask(HEARTBEAT_TASK, async () => {
    if ((await storage.get(WANT_KEY)) !== '1') return BackgroundFetch.BackgroundFetchResult.NoData;
    let pos: Location.LocationObject | null = null;
    try {
      if (await Location.hasServicesEnabledAsync()) pos = await Location.getLastKnownPositionAsync();
    } catch {
      // services off or no permission: pos stays null, the ping still reports services_on/perm
    }
    await postPing(
      pos
        ? { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null, at: new Date(pos.timestamp).toISOString(), moving: false }
        : { lat: null, lng: null, accuracy: null, at: null, moving: false },
    );
    return BackgroundFetch.BackgroundFetchResult.NewData;
  });
}

export type GeoPermission = 'granted' | 'foreground-only' | 'denied';

// Ask for location permission, foreground first, then background ("Allow all the time" on Android). Call this from a
// parent/child setup screen where you can explain why. Returns what was granted so the UI can nudge toward "always".
export async function requestGeoPermission(): Promise<GeoPermission> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) return 'denied';
  const bg = await Location.requestBackgroundPermissionsAsync();
  return bg.granted ? 'granted' : 'foreground-only';
}

// Start the foreground-service location updates and the heartbeat. Idempotent. The foreground-service notification
// is deliberately visible (not covert): this is open parental monitoring, and Android requires it for background
// location anyway.
let transition: Promise<void> = Promise.resolve();
function serializeTracking(action: () => Promise<void>): Promise<void> {
  const next = transition.catch(() => {}).then(action);
  transition = next;
  return next;
}

export function startTracking(labels: { title: string; body: string }): Promise<void> {
  return serializeTracking(() => startTrackingNow(labels));
}

async function startTrackingNow(labels: { title: string; body: string }): Promise<void> {
  if (!tracked) return;
  await storage.set(WANT_KEY, '1');
  // Report permission/services status before waiting for a GPS fix (which may never
  // arrive indoors). Keep the heartbeat when permission is revoked, so the parent
  // still gets a status report rather than silently losing this device.
  void postPing({ lat: null, lng: null, accuracy: null, at: null, moving: false });
  try {
    if (!(await TaskManager.isTaskRegisteredAsync(HEARTBEAT_TASK))) {
      await BackgroundFetch.registerTaskAsync(HEARTBEAT_TASK, { minimumInterval: 15 * 60, stopOnTerminate: false, startOnBoot: true });
    }
  } catch {
    // Background fetch is best effort; the location service still reports fixes.
  }
  const fg = await Location.getForegroundPermissionsAsync();
  if (!fg.granted) return; // nothing to start until the child/parent grants permission on the setup screen

  if (!(await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK))) {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 3 * 60_000, // at most ~ every 3 min when still…
      distanceInterval: 60, // …or every 60 m of movement
      deferredUpdatesInterval: 2 * 60_000,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: labels.title,
        notificationBody: labels.body,
        notificationColor: '#2A4BB0',
        killServiceOnDestroy: false,
      },
    });
  }
  // report once right away so the parent sees a point without waiting for the first scheduled fix
  void pingNow();
}

export function stopTracking(): Promise<void> {
  return serializeTracking(stopTrackingNow);
}

async function stopTrackingNow(): Promise<void> {
  if (!tracked) return;
  await storage.set(WANT_KEY, '0');
  try {
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  } catch { /* already stopped */ }
  try {
    await BackgroundFetch.unregisterTaskAsync(HEARTBEAT_TASK);
  } catch { /* not registered */ }
}

// Reconcile with the parent's setting from /child/state: start when on (and permission is held), stop when off.
export async function syncTracking(on: boolean, labels: { title: string; body: string }): Promise<void> {
  if (!tracked) return;
  if (on) await startTracking(labels);
  else await stopTracking();
}

// An immediate foreground ping — on app open, on return from background, or right after starting — so a disabled
// location switch or revoked permission reaches the parent within seconds rather than at the next schedule.
export async function pingNow(): Promise<void> {
  if (!tracked) return;
  if ((await storage.get(WANT_KEY)) !== '1') return;
  let pos: Location.LocationObject | null = null;
  try {
    if (await Location.hasServicesEnabledAsync()) {
      pos = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    }
  } catch {
    // services off / permission gone: report with no fix so the server still updates status and alerts the parent
  }
  await postPing(
    pos
      ? { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null, at: new Date(pos.timestamp).toISOString(), moving: false }
      : { lat: null, lng: null, accuracy: null, at: null, moving: false },
  );
}

// Whether the child phone currently wants to track (persisted desire), for showing status on a settings screen.
export async function isTrackingWanted(): Promise<boolean> {
  try {
    return (await storage.get(WANT_KEY)) === '1';
  } catch {
    return false;
  }
}
