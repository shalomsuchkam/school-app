import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { api, API_BASE, ApiError, getToken, isTokenRejected, setToken, type Role } from './api';
import { stopGuard, storedGuardSession } from './screenGuard';
import { storage } from './storage';

// Where this device's session lives, and how it survives a bad SecureStore read on cold start.
//
// expo-secure-store on Android can lose a value with no error at all. When the Keystore can't decrypt an entry
// (BadPaddingException / AEADBadTagException) or its key alias is missing, getItemAsync DELETES the entry and
// resolves null. Other Keystore failures reject. Either way, before this module the app treated it as "signed out",
// sent the child to the welcome screen and needed a new join code, even though the server still knew the device.
// Three copies, read in this order:
//   1. SecureStore `uroki.session.v2`: the primary.
//   2. A plain app-private file in the document directory (mirror). The Android screen guard already keeps the
//      same token in app-private SharedPreferences, so this does not lower the bar.
//   3. Android child phones only: the screen guard's config (token + childId), checked once with the server.
// Only a definite "nothing anywhere" means signed out. A read that keeps failing becomes `error`, and the app
// shows a retry screen instead of the welcome screen.

export const SESSION_KEY = 'uroki.session.v2';
export type StoredSession = { token: string; role: Role };
export type LoadResult =
  | { kind: 'ok'; session: StoredSession; source: 'secure' | 'mirror' | 'guard' }
  | { kind: 'none' }
  | { kind: 'error'; error: unknown };

const native = Platform.OS !== 'web';
const ROLES: readonly Role[] = ['parent', 'child', 'viewer'];

export function parseSession(raw: string | null | undefined): StoredSession | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (v && typeof v.token === 'string' && v.token && ROLES.includes(v.role)) return { token: v.token, role: v.role };
  } catch {}
  return null;
}

// --- mirror file (native only: on web `storage` is localStorage already) ---
const mirrorFile = () => new File(Paths.document, 'session.v2.json');
export function readMirror(): string | null {
  if (!native) return null;
  try {
    const f = mirrorFile();
    return f.exists ? f.textSync() : null;
  } catch {
    return null;
  }
}
function writeMirror(v: string): boolean {
  if (!native) return false;
  try {
    const f = mirrorFile();
    if (!f.exists) f.create();
    f.write(v);
    return true;
  } catch {
    return false;
  }
}
function clearMirror() {
  if (!native) return;
  try {
    const f = mirrorFile();
    if (f.exists) f.delete();
  } catch {}
}

// --- SecureStore read with retries: a cold-start Keystore hiccup (or a hang) must not become a sign-out ---
export type ReadOptions = { delays?: number[]; timeoutMs?: number };
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('SecureStore read timed out')), ms);
    p.then(
      (v) => (clearTimeout(id), resolve(v)),
      (e) => (clearTimeout(id), reject(e)),
    );
  });
}
export async function readSecure(opts: ReadOptions = {}): Promise<{ ok: true; value: string | null } | { ok: false; error: unknown }> {
  const delays = opts.delays ?? [200, 600, 1500];
  const timeoutMs = opts.timeoutMs ?? 5000;
  let error: unknown;
  for (let i = 0; i <= delays.length; i++) {
    if (i > 0) await sleep(delays[i - 1]);
    try {
      return { ok: true, value: (await withTimeout(storage.get(SESSION_KEY), timeoutMs)) ?? null };
    } catch (e) {
      error = e;
    }
  }
  return { ok: false, error };
}

// Is the guard's token still this child device on the server? Only a 401/403 on that token says no. Offline or a
// server error can't tell, so the session is restored and the child screen re-checks it on its first load.
async function guardTokenRejected(token: string): Promise<boolean> {
  const prev = getToken();
  setToken(token);
  try {
    await api.childState();
    return false;
  } catch (e) {
    return e instanceof ApiError && (e.status === 401 || e.status === 403);
  } finally {
    setToken(prev);
  }
}

async function guardSession(): Promise<StoredSession | null> {
  if (Platform.OS !== 'android') return null;
  const g = await storedGuardSession();
  if (!g?.token) return null;
  // a guard set up against another server (e.g. a dev build) is not this app's session
  if (g.apiBase && g.apiBase.replace(/\/+$/, '') !== API_BASE.replace(/\/+$/, '')) return null;
  if (await guardTokenRejected(g.token)) return null;
  return { token: g.token, role: 'child' };
}

/** Restores the session at app start. Never resolves `none` because of a read error. */
export async function loadSession(opts: ReadOptions = {}): Promise<LoadResult> {
  const secure = await readSecure(opts);
  if (secure.ok) {
    const s = parseSession(secure.value);
    if (s) {
      // keep the mirror current (also fills it on the first start after this update)
      const raw = JSON.stringify(s);
      if (readMirror() !== raw) writeMirror(raw);
      return { kind: 'ok', session: s, source: 'secure' };
    }
  }
  const resave = async (s: StoredSession) => {
    const raw = JSON.stringify(s);
    writeMirror(raw);
    await storage.set(SESSION_KEY, raw).catch(() => {});
  };
  const mirrored = parseSession(readMirror());
  if (mirrored) {
    await resave(mirrored);
    return { kind: 'ok', session: mirrored, source: 'mirror' };
  }
  const fromGuard = await guardSession().catch(() => null);
  if (fromGuard) {
    await resave(fromGuard);
    return { kind: 'ok', session: fromGuard, source: 'guard' };
  }
  return secure.ok ? { kind: 'none' } : { kind: 'error', error: secure.error };
}

/** Sign-in: both copies. Fails only when neither could be written. */
export async function saveSession(s: StoredSession): Promise<void> {
  const raw = JSON.stringify(s);
  const mirrored = writeMirror(raw);
  try {
    await storage.set(SESSION_KEY, raw);
  } catch (e) {
    if (!mirrored) throw e;
  }
}

/**
 * Sign-out: every copy, the guard's first. A deliberate logout must not come back through the restore path.
 * Stopping the guard also stops app blocking, which a signed-out phone must not keep doing.
 */
export async function clearSession(): Promise<void> {
  if (Platform.OS === 'android') await stopGuard();
  clearMirror();
  try {
    await storage.del(SESSION_KEY);
  } catch {
    // delete failed: an empty value still reads back as "signed out"
    await storage.set(SESSION_KEY, '').catch(() => {});
  }
}

/** Token for headless tasks (location): SecureStore, else the mirror. Read only, never restores or writes. */
export async function readSessionToken(): Promise<string | null> {
  let raw: string | null = null;
  try {
    raw = await storage.get(SESSION_KEY);
  } catch {}
  return (parseSession(raw) ?? parseSession(readMirror()))?.token ?? null;
}

/**
 * A screen got an error from a call: is this device really signed out? Only when the server rejected the token
 * that was sent, and a second call (/me) confirms it, so one stray 401 (a proxy, a race with sign-in) doesn't
 * cost the child a new join code.
 */
export async function deviceSignedOut(e: unknown): Promise<boolean> {
  if (!isTokenRejected(e)) return false;
  try {
    await api.me();
    return false;
  } catch (e2) {
    return isTokenRejected(e2);
  }
}
