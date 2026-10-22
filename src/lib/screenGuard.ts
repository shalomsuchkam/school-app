import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

// Local Android module (modules/screen-guard), docs/SCREEN_TIME.md "Native module API". iOS and web have no
// module yet: status() reports supported:false and the other calls do nothing.

export type GuardStatus = {
  supported: boolean;
  usage_access: boolean;
  overlay: boolean;
  battery_ok: boolean;
  running: boolean;
  configured: boolean;
};

export type InstalledApp = { pkg: string; name: string };
export type UsageToday = { total_min: number; apps: Record<string, number> };

type Native = {
  status(): Promise<Omit<GuardStatus, 'supported'> & { supported: true }>;
  openUsageAccessSettings(): Promise<boolean>;
  openOverlaySettings(): Promise<boolean>;
  openBatterySettings(): Promise<boolean>;
  start(config: { apiBase: string; token: string; childId: string }): Promise<boolean>;
  stop(): Promise<boolean>;
  setRules(snapshot: Record<string, unknown>): Promise<boolean>;
  installedApps(): Promise<InstalledApp[]>;
  usageToday(): Promise<UsageToday>;
};

const native = Platform.OS === 'android' ? requireOptionalNativeModule<Native>('ScreenGuard') : null;

const UNSUPPORTED: GuardStatus = {
  supported: false,
  usage_access: false,
  overlay: false,
  battery_ok: false,
  running: false,
  configured: false,
};

export const guardSupported = native != null;

/** Every permission the guard needs to block apps (battery is recommended, not required). */
export function guardReady(s: GuardStatus): boolean {
  return s.supported && s.usage_access && s.overlay;
}

async function call<T>(fn: (n: Native) => Promise<T>, fallback: T): Promise<T> {
  if (!native) return fallback;
  try {
    return await fn(native);
  } catch {
    return fallback;
  }
}

export const guardStatus = () => call((n) => n.status(), UNSUPPORTED);
export const openUsageAccessSettings = () => call((n) => n.openUsageAccessSettings(), false);
export const openOverlaySettings = () => call((n) => n.openOverlaySettings(), false);
export const openBatterySettings = () => call((n) => n.openBatterySettings(), false);
export const startGuard = (config: { apiBase: string; token: string; childId: string }) =>
  call((n) => n.start(config), false);
export const stopGuard = () => call((n) => n.stop(), false);
/** Hands a fresh GET /screen/rules response to the guard right away (it also polls every 5 minutes). */
export const setGuardRules = (snapshot: Record<string, unknown>) => call((n) => n.setRules(snapshot), false);
export const installedApps = () => call((n) => n.installedApps(), [] as InstalledApp[]);
export const usageToday = () => call((n) => n.usageToday(), { total_min: 0, apps: {} } as UsageToday);
