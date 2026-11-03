import * as Notifications from 'expo-notifications';
import { api } from '@/lib/api';
import { registerPush } from '@/lib/push';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: { eas: { projectId: 'test-project' } } } } }));
jest.mock('@/lib/api', () => ({ api: { pushToken: jest.fn() } }));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(), requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(), setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
}));

beforeEach(() => {
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ granted: true } as any);
  jest.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({ data: 'ExponentPushToken[test]' } as any);
});

it('registers an unchanged installation token again after a new family sign-in', async () => {
  await registerPush(false);
  await registerPush(false);
  expect(api.pushToken).toHaveBeenCalledTimes(2);
});

it('never registers a token when permission is denied and prompting is disabled', async () => {
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ granted: false, canAskAgain: true } as any);
  await registerPush(false);
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  expect(api.pushToken).not.toHaveBeenCalled();
});

it('retries server registration after a transient failure', async () => {
  jest.mocked(api.pushToken).mockRejectedValueOnce(new Error('offline'));
  await expect(registerPush(false)).rejects.toThrow('offline');
  await registerPush(false);
  expect(api.pushToken).toHaveBeenCalledTimes(2);
});
