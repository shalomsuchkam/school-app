import { render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { DeviceOwnerCard } from '@/components/DeviceOwnerCard';
import { guardStatus } from '@/lib/screenGuard';
import { t } from '@/lib/i18n';
import { applyEnv } from './helpers';

jest.mock('expo-router', () => ({
  useFocusEffect: function useFocusEffect(callback: () => void) {
    require('react').useEffect(callback, [callback]);
  },
}));
jest.mock('@/lib/screenGuard', () => ({ guardStatus: jest.fn() }));

beforeEach(async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  await applyEnv({ width: 390, height: 844, lang: 'en' });
});
afterEach(() => jest.restoreAllMocks());

it('does not claim protection for older native builds without ownership fields', async () => {
  jest.mocked(guardStatus).mockResolvedValue({ supported: true } as never);
  await render(<DeviceOwnerCard />);
  expect(await screen.findByText(t('owner.notManaged'))).toBeOnTheScreen();
  expect(screen.queryByText(t('owner.protected'))).toBeNull();
});

it('requires both ownership and confirmed uninstall policy before showing protection', async () => {
  jest.mocked(guardStatus).mockResolvedValue({ supported: true, device_owner: true, uninstall_blocked: false } as never);
  await render(<DeviceOwnerCard />);
  expect(await screen.findByText(t('owner.error'))).toBeOnTheScreen();
  expect(screen.queryByText(t('owner.protected'))).toBeNull();
});

it('shows verified protection and parent USB recovery instructions, without an in-app release button', async () => {
  jest.mocked(guardStatus).mockResolvedValue({ supported: true, device_owner: true, uninstall_blocked: true } as never);
  await render(<DeviceOwnerCard />);
  expect(await screen.findByText(t('owner.protected'))).toBeOnTheScreen();
  expect(screen.getByText(t('owner.release'))).toBeOnTheScreen();
  expect(screen.queryAllByRole('button')).toHaveLength(0);
});
