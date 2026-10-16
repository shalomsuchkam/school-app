import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { setToken, type Role } from './api';
import { clearCurrentChild } from './currentChild';
import { clearPhotoQueue } from './offline';
import { storage } from './storage';
import { clearWidget } from './widget';

export type Session = { token: string; role: Role } | null;
type Ctx = { session: Session | undefined; signIn: (s: { token: string; role: Role }) => Promise<void>; signOut: () => Promise<void> };

const AuthContext = createContext<Ctx | null>(null);
const KEY = 'uroki.session.v2';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | undefined>(undefined);
  useEffect(() => {
    storage
      .get(KEY)
      .then((v) => {
        const s = v ? (JSON.parse(v) as Session) : null;
        setToken(s?.token ?? null);
        setSession(s);
      })
      .catch(() => setSession(null));
  }, []);
  const signIn = async (s: { token: string; role: Role }) => {
    await storage.set(KEY, JSON.stringify(s));
    setToken(s.token);
    setSession(s);
  };
  const signOut = async () => {
    await storage.del(KEY);
    setToken(null);
    setSession(null);
    // per-account local state: queued homework photos, the child a parent was looking at, the child's home-screen widget
    await Promise.all([clearPhotoQueue(), clearCurrentChild(), clearWidget()]).catch(() => {});
  };
  return <AuthContext.Provider value={{ session, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const c = useContext(AuthContext);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}
