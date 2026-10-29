import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { HEARTBEAT_TASK, LOCATION_TASK, startTracking, stopTracking } from '@/lib/geo';
import { storage } from '@/lib/storage';

jest.mock('@/lib/api', () => ({ API_BASE: 'https://example.test/app' }));
jest.mock('@/lib/sessionStore', () => ({ readSessionToken: jest.fn(() => Promise.resolve(null)) }));
jest.mock('@/lib/storage', () => ({ storage: { get: jest.fn(), set: jest.fn() } }));
jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(), getBackgroundPermissionsAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(), hasStartedLocationUpdatesAsync: jest.fn(),
  startLocationUpdatesAsync: jest.fn(), stopLocationUpdatesAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(), getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));
jest.mock('expo-task-manager', () => ({ isTaskDefined: jest.fn(() => false), defineTask: jest.fn(), isTaskRegisteredAsync: jest.fn() }));
jest.mock('expo-background-fetch', () => ({ registerTaskAsync: jest.fn(), unregisterTaskAsync: jest.fn(), BackgroundFetchResult: { NoData: 1, NewData: 2 } }));

const labels = { title: 'Location sharing is on', body: 'The parent can see your location' };
beforeEach(() => {
  jest.mocked(storage.get).mockResolvedValue(null);
  jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({ granted: true } as any);
  jest.mocked(Location.getBackgroundPermissionsAsync).mockResolvedValue({ granted: true } as any);
  jest.mocked(Location.hasServicesEnabledAsync).mockResolvedValue(false);
  jest.mocked(Location.hasStartedLocationUpdatesAsync).mockResolvedValue(false);
  jest.mocked(TaskManager.isTaskRegisteredAsync).mockResolvedValue(false);
});

it('defines location and heartbeat handlers on module import, without mounting a screen', () => {
  // clearMocks clears call history before each test, so inspect the registration in isolation.
  jest.isolateModules(() => { require('@/lib/geo'); });
  expect(TaskManager.defineTask).toHaveBeenCalledWith(LOCATION_TASK, expect.any(Function));
  expect(TaskManager.defineTask).toHaveBeenCalledWith(HEARTBEAT_TASK, expect.any(Function));
});

it('retains a permission-status heartbeat when the child revokes location', async () => {
  jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({ granted: false } as any);
  await startTracking(labels);
  expect(storage.set).toHaveBeenCalledWith('uroki.geo.want.v1', '1');
  expect(BackgroundFetch.registerTaskAsync).toHaveBeenCalledWith(HEARTBEAT_TASK, expect.objectContaining({ stopOnTerminate: false, startOnBoot: true }));
  expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
});

it('serializes an overlapping enable and disable so the final parent setting wins', async () => {
  let release!: () => void;
  jest.mocked(Location.startLocationUpdatesAsync).mockImplementationOnce(() => new Promise<void>((done) => { release = done; }));
  const enable = startTracking(labels);
  // Wait for the first transition to enter the native start call.
  for (let i = 0; i < 20 && !release; i++) await Promise.resolve();
  expect(release).toBeDefined();
  const disable = stopTracking();
  jest.mocked(Location.hasStartedLocationUpdatesAsync).mockResolvedValue(true);
  release();
  await Promise.all([enable, disable]);
  expect(storage.set).toHaveBeenLastCalledWith('uroki.geo.want.v1', '0');
  expect(Location.stopLocationUpdatesAsync).toHaveBeenCalledWith(LOCATION_TASK);
  expect(BackgroundFetch.unregisterTaskAsync).toHaveBeenCalledWith(HEARTBEAT_TASK);
});

it('keeps subsequent transitions usable after a failed native start', async () => {
  jest.mocked(Location.startLocationUpdatesAsync).mockRejectedValueOnce(new Error('Native start failed'));
  await expect(startTracking(labels)).rejects.toThrow('Native start failed');
  await expect(stopTracking()).resolves.toBeUndefined();
  expect(storage.set).toHaveBeenLastCalledWith('uroki.geo.want.v1', '0');
});
