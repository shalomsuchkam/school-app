import type { DeviceReport, ScreenState } from './api';

// Pure helpers for the screen-time screens (docs/SCREEN_TIME.md); no React, so they are unit-tested.

/** A report older than this means the parent's view may be out of date (phone offline, switched off, app removed). */
export const STALE_HOURS = 2;

export type GuardHealth =
  | { kind: 'none' }
  | { kind: 'off'; missing: ('usage_access' | 'overlay' | 'running')[]; hours: number }
  | { kind: 'stale'; hours: number }
  | { kind: 'ok'; minutes: number; battery_ok: boolean };

/** What the parent should know about the child's phone, from the latest device report. */
export function guardHealth(device: DeviceReport | null, now = Date.now()): GuardHealth {
  if (!device || !device.reported_at) return { kind: 'none' };
  const at = Date.parse(device.reported_at);
  const ageMin = Number.isNaN(at) ? Infinity : Math.max(0, Math.floor((now - at) / 60000));
  const hours = Math.floor(ageMin / 60);
  const g = device.guard ?? {};
  const missing = (['usage_access', 'overlay', 'running'] as const).filter((k) => g[k] === false);
  if (missing.length) return { kind: 'off', missing: [...missing], hours };
  if (ageMin >= STALE_HOURS * 60) return { kind: 'stale', hours: Number.isFinite(hours) ? hours : STALE_HOURS };
  return { kind: 'ok', minutes: ageMin, battery_ok: g.battery_ok !== false };
}

/** Today's usage from the report, or empty when the report is from another day. */
export function usageOf(state: Pick<ScreenState, 'device' | 'today'>): { total: number; apps: Record<string, number> } {
  const u = state.device?.usage;
  if (!u || (u.date && state.today && u.date !== state.today)) return { total: 0, apps: {} };
  return { total: Math.max(0, Math.round(u.total_min ?? 0)), apps: u.apps ?? {} };
}

/** The app's name as the child's phone reported it (falls back to the limit's saved name, then the package). */
export function appName(state: Pick<ScreenState, 'device' | 'rules'>, pkg: string): string {
  return state.device?.apps.find((a) => a.pkg === pkg)?.name || state.rules.app_limits.find((l) => l.pkg === pkg)?.name || pkg;
}

/** Search over reported apps by name or package; sorted by today's usage, then by name. */
export function filterApps(apps: { pkg: string; name: string }[], query: string, usage: Record<string, number>, exclude: string[] = []) {
  const q = query.trim().toLowerCase();
  const skip = new Set(exclude);
  return apps
    .filter((a) => !skip.has(a.pkg) && (!q || a.name.toLowerCase().includes(q) || a.pkg.toLowerCase().includes(q)))
    .sort((a, b) => (usage[b.pkg] ?? 0) - (usage[a.pkg] ?? 0) || a.name.localeCompare(b.name));
}

/** Minutes left of the daily limit (null = no limit). `usedMin` counts every app except always-allowed ones. */
export function remaining(limit: number | null, usedMin: number): number | null {
  return limit == null ? null : Math.max(0, limit - Math.max(0, usedMin));
}

/** Minutes used today without the always-allowed apps (approximates the guard's counted total). */
export function countedUsage(total: number, apps: Record<string, number>, alwaysAllowed: string[]): number {
  const free = alwaysAllowed.reduce((s, p) => s + (apps[p] ?? 0), 0);
  return Math.max(0, total - free);
}

/** `unlock_until` still in the future. */
export function unlockActive(until: string | null | undefined, now = Date.now()): boolean {
  if (!until) return false;
  const t = Date.parse(until);
  return !Number.isNaN(t) && t > now;
}

/** "18:30" of an ISO moment in the family time zone (device zone if the tz is unknown). */
export function hmIn(iso: string, tz?: string): string {
  const d = new Date(iso);
  try {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(d);
  } catch {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}

/** Adds or removes a package in a list without duplicates. */
export const withPkg = (list: string[], pkg: string, on: boolean) => (on ? [...list.filter((x) => x !== pkg), pkg] : list.filter((x) => x !== pkg));

// ---------- textbook viewer: navigation stays on the link's own site ----------

/** The lower-case host of an http(s) URL, or null for anything else (other schemes, junk). Userinfo is ignored. */
export function httpHost(url: string): string | null {
  const m = /^(https?):\/\/([^/?#]*)/i.exec(url.trim());
  // a backslash is a path separator for browsers ("https://evil.com\@good.com" goes to evil.com): refuse it
  if (!m || /[\s\\]/.test(m[2])) return null;
  const authority = m[2].slice(m[2].lastIndexOf('@') + 1);
  const host = authority.replace(/:\d*$/, '').toLowerCase();
  return host || null;
}

/**
 * May the in-app textbook viewer open `next` when it started at `base`? The same host, its www twin and its
 * subdomains are allowed (sites redirect between them); every other host and every non-http scheme is not.
 */
export function sameSite(base: string, next: string): boolean {
  if (next === 'about:blank' || next === 'about:srcdoc') return true;
  const b = httpHost(base);
  const n = httpHost(next);
  if (!b || !n) return false;
  const root = b.replace(/^www\./, '');
  return n === b || n === root || n.endsWith(`.${root}`);
}

/** A textbook link the server will accept: http(s), a host, ≤ 500 characters. */
export function validLink(url: string): boolean {
  const s = url.trim();
  return s.length <= 500 && httpHost(s) !== null && !/\s/.test(s);
}
