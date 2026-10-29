import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { setToken, type Role } from './api';
import { clearCurrentChild } from './currentChild';
import { stopTracking } from './geo';
import { clearPhotoQueue } from './offline';
import { clearIos } from './screenGuardIos';
import { clearSession, loadSession, saveSession, type LoadResult } from './sessionStore';
import { clearWidget } from './widget';

export type Session = { token: string; role: Role } | null;
type Ctx = {
  session: Session | undefined;
  loadFailed: boolean;
  retryLoad: () => void;
  signIn: (s: { token: string; role: Role }) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | undefined>(undefined);
  const [loadFailed, setLoadFailed] = useState(false);
  const hydration = useRef({ revision: 0 });
  const restore = useCallback(async () => {
    const rev = ++hydration.current.revision;
    const result = await loadSession().catch((error: unknown): LoadResult => ({ kind: 'error', error }));
    if (rev !== hydration.current.revision) return;
    if (result.kind === 'error') {
      setLoadFailed(true);
      return;
    }
    const saved = result.kind === 'ok' ? result.session : null;
    setToken(saved?.token ?? null);
    setLoadFailed(false);
    setSession(saved);
  }, []);
  useEffect(() => {
    const state = hydration.current;
    let cancelled = false;
    void Promise.resolve().then(() => { if (!cancelled) return restore(); });
    return () => { cancelled = true; ++state.revision; };
  }, [restore]);
  const retryLoad = useCallback(() => { void restore(); }, [restore]);
  const signIn = useCallback(async (saved: { token: string; role: Role }) => {
    await saveSession(saved);
    ++hydration.current.revision;
    setToken(saved.token);
    setLoadFailed(false);
    setSession(saved);
  }, []);
  const signOut = useCallback(async () => {
    // clearSession clears every credential copy and stops the Android guard.
    await clearSession();
    ++hydration.current.revision;
    await stopTracking().catch(() => {});
    clearIos();
    setToken(null);
    setLoadFailed(false);
    setSession(null);
    await Promise.all([clearPhotoQueue(), clearCurrentChild(), clearWidget()]).catch(() => {});
  }, []);
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
