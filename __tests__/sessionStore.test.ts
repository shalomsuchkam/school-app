import { Platform } from 'react-native';

import { clearSession, deviceSignedOut, loadSession, readSecure, readSessionToken, saveSession, SESSION_KEY } from '@/lib/sessionStore';

// SecureStore (lib/storage), the mirror file (expo-file-system), the Android screen guard and the API are fakes.
const mockSecure = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
jest.mock('@/lib/storage', () => ({
  get storage() {
    return mockSecure;
  },
}));

const mockFile: { exists: boolean; content: string | null; fail: boolean } = { exists: false, content: null, fail: false };
jest.mock('expo-file-system', () => ({
  Paths: { document: 'file:///doc' },
  File: jest.fn().mockImplementation(() => ({
    get exists() {
      if (mockFile.fail) throw new Error('fs');
      return mockFile.exists;
    },
    textSync: () => mockFile.content ?? '',
    create: () => {
      mockFile.exists = true;
    },
    write: (v: string) => {
      if (mockFile.fail) throw new Error('fs');
      mockFile.content = v;
    },
    delete: () => {
      mockFile.exists = false;
      mockFile.content = null;
    },
  })),
}));

const mockGuard = { stored: jest.fn(), stop: jest.fn() };
jest.mock('@/lib/screenGuard', () => ({ storedGuardSession: () => mockGuard.stored(), stopGuard: () => mockGuard.stop() }));

const mockApi = { childState: jest.fn(), me: jest.fn(), token: null as string | null, tokenDuringCall: [] as (string | null)[] };
jest.mock('@/lib/api', () => {
  class ApiError extends Error {
    status: number;
    authed: boolean;
    constructor(message: string, code: number, sentToken = false) {
      super(message);
      this.status = code;
      this.authed = sentToken;
    }
  }
  return {
    API_BASE: 'https://api.example/app',
    ApiError,
    isTokenRejected: (e: unknown) => e instanceof ApiError && e.status === 401 && e.authed,
    getToken: () => mockApi.token,
    setToken: (t: string | null) => {
      mockApi.token = t;
    },
    api: {
      childState: () => {
        mockApi.tokenDuringCall.push(mockApi.token);
        return mockApi.childState();
      },
      me: () => mockApi.me(),
    },
  };
});
const { ApiError } = jest.requireMock('@/lib/api') as { ApiError: new (m: string, s: number, a?: boolean) => Error };

const FAST = { delays: [0, 0, 0], timeoutMs: 50 };
const CHILD = { token: 'tok-child', role: 'child' as const };
const raw = (s: object) => JSON.stringify(s);

beforeEach(() => {
  (Platform as { OS: string }).OS = 'android';
  mockSecure.get.mockReset().mockResolvedValue(null);
  mockSecure.set.mockReset().mockResolvedValue(undefined);
  mockSecure.del.mockReset().mockResolvedValue(undefined);
  Object.assign(mockFile, { exists: false, content: null, fail: false });
  mockGuard.stored.mockReset().mockResolvedValue(null);
  mockGuard.stop.mockReset().mockResolvedValue(true);
  mockApi.childState.mockReset().mockResolvedValue({});
  mockApi.me.mockReset().mockResolvedValue({});
  mockApi.token = null;
  mockApi.tokenDuringCall = [];
});

describe('readSecure', () => {
  it('retries a failing SecureStore read and returns the value once it works', async () => {
    mockSecure.get.mockRejectedValueOnce(new Error('keystore')).mockRejectedValueOnce(new Error('keystore')).mockResolvedValue('v');
    await expect(readSecure(FAST)).resolves.toEqual({ ok: true, value: 'v' });
    expect(mockSecure.get).toHaveBeenCalledTimes(3);
  });

  it('reports an error (not "no value") after every attempt fails', async () => {
    mockSecure.get.mockRejectedValue(new Error('keystore'));
    const r = await readSecure(FAST);
    expect(r.ok).toBe(false);
    expect(mockSecure.get).toHaveBeenCalledTimes(4);
  });

  it('treats a hanging read as a failed attempt and retries', async () => {
    mockSecure.get.mockReturnValueOnce(new Promise(() => {})).mockResolvedValue('v');
    await expect(readSecure(FAST)).resolves.toEqual({ ok: true, value: 'v' });
  });
});

describe('loadSession', () => {
  it('uses the SecureStore session and fills the mirror', async () => {
    mockSecure.get.mockResolvedValue(raw(CHILD));
    await expect(loadSession(FAST)).resolves.toEqual({ kind: 'ok', session: CHILD, source: 'secure' });
    expect(mockFile.content).toBe(raw(CHILD));
    expect(mockGuard.stored).not.toHaveBeenCalled();
  });

  it('is signed out only when every copy is definitely empty', async () => {
    await expect(loadSession(FAST)).resolves.toEqual({ kind: 'none' });
  });

  it('never turns a read error into a sign-out: no copy left means an error state', async () => {
    mockSecure.get.mockRejectedValue(new Error('keystore'));
    const r = await loadSession(FAST);
    expect(r.kind).toBe('error');
  });

  it('restores from the mirror when SecureStore lost the value, and writes it back', async () => {
    Object.assign(mockFile, { exists: true, content: raw(CHILD) });
    await expect(loadSession(FAST)).resolves.toEqual({ kind: 'ok', session: CHILD, source: 'mirror' });
    expect(mockSecure.set).toHaveBeenCalledWith(SESSION_KEY, raw(CHILD));
  });

  it('restores from the mirror when SecureStore keeps failing', async () => {
    mockSecure.get.mockRejectedValue(new Error('keystore'));
    Object.assign(mockFile, { exists: true, content: raw(CHILD) });
    await expect(loadSession(FAST)).resolves.toMatchObject({ kind: 'ok', source: 'mirror' });
  });

  it('ignores a corrupt SecureStore value and falls back', async () => {
    mockSecure.get.mockResolvedValue('{not json');
    Object.assign(mockFile, { exists: true, content: raw(CHILD) });
    await expect(loadSession(FAST)).resolves.toMatchObject({ kind: 'ok', source: 'mirror' });
  });

  describe('screen guard copy (Android child phone)', () => {
    const guard = { token: 'tok-guard', childId: '7', apiBase: 'https://api.example/app/' };

    it('restores the child session after the server accepts the token, with that token', async () => {
      mockGuard.stored.mockResolvedValue(guard);
      await expect(loadSession(FAST)).resolves.toEqual({ kind: 'ok', session: { token: 'tok-guard', role: 'child' }, source: 'guard' });
      expect(mockApi.tokenDuringCall).toEqual(['tok-guard']);
      expect(mockApi.token).toBeNull(); // the caller (auth) sets the token, not the check
      expect(mockSecure.set).toHaveBeenCalledWith(SESSION_KEY, raw({ token: 'tok-guard', role: 'child' }));
      expect(mockFile.content).toBe(raw({ token: 'tok-guard', role: 'child' }));
    });

    it('does not restore a token the server rejects', async () => {
      mockGuard.stored.mockResolvedValue(guard);
      mockApi.childState.mockRejectedValue(new ApiError('gone', 401, true));
      await expect(loadSession(FAST)).resolves.toEqual({ kind: 'none' });
      expect(mockSecure.set).not.toHaveBeenCalled();
    });

    it('restores when the check cannot reach the server (offline cold start)', async () => {
      mockGuard.stored.mockResolvedValue(guard);
      mockApi.childState.mockRejectedValue(new ApiError('offline', 0));
      await expect(loadSession(FAST)).resolves.toMatchObject({ kind: 'ok', source: 'guard' });
    });

    it('ignores a guard set up against another server', async () => {
      mockGuard.stored.mockResolvedValue({ ...guard, apiBase: 'https://other.example/app' });
      await expect(loadSession(FAST)).resolves.toEqual({ kind: 'none' });
      expect(mockApi.childState).not.toHaveBeenCalled();
    });

    it('is not used off Android', async () => {
      (Platform as { OS: string }).OS = 'ios';
      mockGuard.stored.mockResolvedValue(guard);
      await expect(loadSession(FAST)).resolves.toEqual({ kind: 'none' });
    });
  });
});

describe('saveSession / clearSession', () => {
  it('sign-in writes both copies and survives a SecureStore write failure', async () => {
    mockSecure.set.mockRejectedValue(new Error('keystore'));
    await saveSession(CHILD);
    expect(mockFile.content).toBe(raw(CHILD));
  });

  it('sign-in fails when neither copy could be written', async () => {
    mockSecure.set.mockRejectedValue(new Error('keystore'));
    mockFile.fail = true;
    await expect(saveSession(CHILD)).rejects.toThrow('keystore');
  });

  it('sign-out clears the guard copy, the mirror and SecureStore, so a logout cannot be restored', async () => {
    await saveSession(CHILD);
    await clearSession();
    expect(mockGuard.stop).toHaveBeenCalled();
    expect(mockFile.exists).toBe(false);
    expect(mockSecure.del).toHaveBeenCalledWith(SESSION_KEY);
    mockGuard.stored.mockResolvedValue(null); // stop() cleared the guard config
    await expect(loadSession(FAST)).resolves.toEqual({ kind: 'none' });
  });

  it('sign-out blanks the value when SecureStore cannot delete it', async () => {
    mockSecure.del.mockRejectedValue(new Error('keystore'));
    await clearSession();
    expect(mockSecure.set).toHaveBeenCalledWith(SESSION_KEY, '');
  });
});

describe('readSessionToken (headless location task)', () => {
  it('reads SecureStore, else the mirror, and never writes', async () => {
    mockSecure.get.mockRejectedValue(new Error('keystore'));
    Object.assign(mockFile, { exists: true, content: raw(CHILD) });
    await expect(readSessionToken()).resolves.toBe('tok-child');
    expect(mockSecure.set).not.toHaveBeenCalled();
  });
});

describe('deviceSignedOut', () => {
  it('ignores errors other than a 401 on an authenticated call', async () => {
    await expect(deviceSignedOut(new ApiError('x', 500, true))).resolves.toBe(false);
    await expect(deviceSignedOut(new ApiError('no token yet', 401, false))).resolves.toBe(false);
    expect(mockApi.me).not.toHaveBeenCalled();
  });

  it('needs a second 401 from /me to confirm', async () => {
    await expect(deviceSignedOut(new ApiError('stray', 401, true))).resolves.toBe(false);
    mockApi.me.mockRejectedValue(new ApiError('gone', 401, true));
    await expect(deviceSignedOut(new ApiError('gone', 401, true))).resolves.toBe(true);
  });

  it('does not sign out when the confirmation is offline', async () => {
    mockApi.me.mockRejectedValue(new ApiError('offline', 0));
    await expect(deviceSignedOut(new ApiError('gone', 401, true))).resolves.toBe(false);
  });
});
