import { useSyncExternalStore } from 'react';
import { Appearance, Platform } from 'react-native';

import { storage } from './storage';

// Per-device appearance: follow the system, force light / dark, or "by schedule" (dark 20:00–07:00 local).
// Also the child's "large text" preference. Both live in local storage, never on the server.
export type ThemeMode = 'system' | 'light' | 'dark' | 'schedule';
export const THEME_MODES: ThemeMode[] = ['system', 'light', 'dark', 'schedule'];
export const NIGHT_FROM = 20 * 60;
export const NIGHT_TO = 7 * 60;

/** 20:00 ≤ t < 07:00 in the phone's local time. */
export function isNight(d: Date) {
  const m = d.getHours() * 60 + d.getMinutes();
  return m >= NIGHT_FROM || m < NIGHT_TO;
}

/** The scheme to draw for a mode, given the system scheme and the current time. */
export function resolveScheme(mode: ThemeMode, system: string | null | undefined, now: Date = new Date()): 'light' | 'dark' {
  if (mode === 'light' || mode === 'dark') return mode;
  if (mode === 'schedule') return isNight(now) ? 'dark' : 'light';
  return system === 'dark' ? 'dark' : 'light';
}

/** Milliseconds until the next 07:00 / 20:00 switch (when the scheduled scheme flips). */
export function msToNextSwitch(now: Date) {
  const m = now.getHours() * 60 + now.getMinutes();
  const next = m < NIGHT_TO ? NIGHT_TO : m < NIGHT_FROM ? NIGHT_FROM : NIGHT_TO + 1440;
  return Math.max(1000, (next - m) * 60_000 - now.getSeconds() * 1000 - now.getMilliseconds());
}

const KEY_MODE = 'uroki.theme';
const KEY_BIG = 'uroki.bigText';
export const BIG_TEXT_SCALE = 1.2;

type State = { mode: ThemeMode; night: boolean; bigText: boolean };
let state: State = { mode: 'system', night: isNight(new Date()), bigText: false };
const listeners = new Set<() => void>();
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
};
const getState = () => state;
function emit(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((f) => f());
  applyNative();
}

// Native views outside our palette (alerts, keyboards, date pickers, Modal chrome) follow Appearance.
function applyNative() {
  if (Platform.OS === 'web') return;
  try {
    Appearance.setColorScheme(state.mode === 'system' ? 'unspecified' : resolveScheme(state.mode, null, new Date()));
  } catch {}
}

let timer: ReturnType<typeof setTimeout> | null = null;
function schedule() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (state.mode !== 'schedule') return;
  timer = setTimeout(() => {
    emit({ night: isNight(new Date()) });
    schedule();
  }, msToNextSwitch(new Date()));
}

export async function initAppearance() {
  try {
    const [m, b] = await Promise.all([storage.get(KEY_MODE), storage.get(KEY_BIG)]);
    emit({ mode: THEME_MODES.includes(m as ThemeMode) ? (m as ThemeMode) : 'system', bigText: b === '1', night: isNight(new Date()) });
    schedule();
  } catch {}
}

export function setThemeMode(mode: ThemeMode) {
  emit({ mode, night: isNight(new Date()) });
  schedule();
  storage.set(KEY_MODE, mode).catch(() => {});
}

export function setBigText(on: boolean) {
  emit({ bigText: on });
  storage.set(KEY_BIG, on ? '1' : '0').catch(() => {});
}

/** Re-checks the clock (e.g. when the app returns to the foreground after the night switch). */
export function refreshAppearance() {
  const night = isNight(new Date());
  if (night !== state.night) emit({ night });
  schedule();
}

export const getAppearance = getState;
export function useAppearance() {
  return useSyncExternalStore(subscribe, getState, getState);
}

/** The scheme the app draws now: a forced or scheduled mode wins over the system setting. */
export function schemeFor(a: State, system: string | null | undefined): 'light' | 'dark' {
  if (a.mode === 'schedule') return a.night ? 'dark' : 'light';
  return resolveScheme(a.mode, system);
}
