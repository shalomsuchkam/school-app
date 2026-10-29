import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { setToken, type Role } from './api';
import { clearCurrentChild } from './currentChild';
import { clearPhotoQueue } from './offline';
import { clearSession, loadSession, saveSession, type LoadResult } from './sessionStore';
import { clearWidget } from './widget';

export type Session = { token: string; role: Role } | null;
type Ctx = {
  // undefined while loading; null = definitely signed out
  session: Session | undefined;
  // the stored session could not be read (not "absent"): the app shows a retry screen, never the welcome screen
  loadFailed: boolean;
  retryLoad: () => void;
  signIn: (s: { token: string; role: Role }) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | undefined>(undefined);
  const [loadFailed, setLoadFailed] = useState(false);
  const apply = useCallback((r: LoadResult) => {
    if (r.kind === 'error') return setLoadFailed(true);
    const s = r.kind === 'ok' ? r.session : null;
    setToken(s?.token ?? null);
    setSession(s);
  }, []);
  const load = useCallback(() => loadSession().catch((error: unknown): LoadResult => ({ kind: 'error', error })), []);
  useEffect(() => {
    load().then(apply);
  }, [load, apply]);
  const retryLoad = useCallback(() => {
    setLoadFailed(false);
    setSession(undefined);
    load().then(apply);
  }, [load, apply]);
  const signIn = async (s: { token: string; role: Role }) => {
    await saveSession(s);
    setToken(s.token);
    setLoadFailed(false);
    setSession(s);
  };
  const signOut = async () => {
    // clears the screen guard's copy too, so the restore path can't bring a deliberate logout back
    await clearSession();
    setToken(null);
    setSession(null);
    // per-account local state: queued homework photos, the child a parent was looking at, the child's home-screen widget
    await Promise.all([clearPhotoQueue(), clearCurrentChild(), clearWidget()]).catch(() => {});
  };
  return <AuthContext.Provider value={{ session, loadFailed, retryLoad, signIn, signOut }}>{children}</AuthContext.Provider>;
}

/** A tutor / teacher device: the parent screens, read-only. */
export function useIsViewer() {
  return useAuth().session?.role === 'viewer';
}

export function useAuth() {
  const c = useContext(AuthContext);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}
