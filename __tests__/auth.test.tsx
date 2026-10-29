import { act, renderHook } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '@/lib/auth';
import { setToken } from '@/lib/api';
import { clearSession, loadSession, saveSession } from '@/lib/sessionStore';
import { stopTracking } from '@/lib/geo';

jest.mock('@/lib/api', () => ({ setToken: jest.fn() }));
jest.mock('@/lib/sessionStore', () => ({ loadSession: jest.fn(), saveSession: jest.fn(), clearSession: jest.fn() }));
jest.mock('@/lib/currentChild', () => ({ clearCurrentChild: jest.fn() }));
jest.mock('@/lib/offline', () => ({ clearPhotoQueue: jest.fn() }));
jest.mock('@/lib/widget', () => ({ clearWidget: jest.fn() }));
jest.mock('@/lib/geo', () => ({ stopTracking: jest.fn(() => Promise.resolve()) }));
jest.mock('@/lib/screenGuardIos', () => ({ clearIos: jest.fn() }));

const signedIn = { token: 'test-device-credential', role: 'child' as const };
let saved: typeof signedIn | null;
beforeEach(() => {
  saved = null;
  jest.mocked(loadSession).mockReset().mockImplementation(async () => saved ? { kind: 'ok', session: saved, source: 'secure' } : { kind: 'none' });
  jest.mocked(saveSession).mockReset().mockImplementation(async (value) => { saved = value as typeof signedIn; });
  jest.mocked(clearSession).mockReset().mockImplementation(async () => { saved = null; });
});

it('restores the saved family after a fresh provider mount', async () => {
  const first = await renderHook(() => useAuth(), { wrapper: AuthProvider });
  await act(() => first.result.current.signIn(signedIn));
  await first.unmount();
  const next = await renderHook(() => useAuth(), { wrapper: AuthProvider });
  expect(next.result.current.session).toEqual(signedIn);
  expect(setToken).toHaveBeenLastCalledWith(signedIn.token);
});

it('keeps a locked keychain recoverable instead of presenting a new-family flow', async () => {
  saved = signedIn;
  jest.mocked(loadSession).mockResolvedValueOnce({ kind: 'error', error: new Error('Keychain unavailable') });
  const { result } = await renderHook(() => useAuth(), { wrapper: AuthProvider });
  expect(result.current.session).toBeUndefined();
  expect(result.current.loadFailed).toBe(true);
  expect(clearSession).not.toHaveBeenCalled();
  await act(async () => { result.current.retryLoad(); });
  expect(result.current.session).toEqual(signedIn);
  expect(result.current.loadFailed).toBe(false);
});

it('does not overwrite a new login with an older pending hydration response', async () => {
  let resolve!: (value: { kind: 'none' }) => void;
  jest.mocked(loadSession).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  const { result } = await renderHook(() => useAuth(), { wrapper: AuthProvider });
  await act(() => result.current.signIn(signedIn));
  await act(async () => resolve({ kind: 'none' }));
  expect(result.current.session).toEqual(signedIn);
  expect(setToken).toHaveBeenLastCalledWith(signedIn.token);
});

it('stops location and removes the credential on explicit sign-out', async () => {
  saved = signedIn;
  const { result } = await renderHook(() => useAuth(), { wrapper: AuthProvider });
  await act(() => result.current.signOut());
  expect(clearSession).toHaveBeenCalledTimes(1);
  expect(stopTracking).toHaveBeenCalledTimes(1);
  expect(saved).toBeNull();
  expect(result.current.session).toBeNull();
});
