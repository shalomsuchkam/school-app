import { render, screen } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { GeoPanel } from '@/components/GeoPanel';
import { syncTracking } from '@/lib/geo';

jest.mock('expo-router', () => ({ useFocusEffect: (fn: () => void) => require('react').useEffect(fn, [fn]) }));
jest.mock('@/lib/i18n', () => {
  const translate = (key: string) => key;
  return { useT: () => translate };
});
jest.mock('@/components/ui', () => ({ Banner: ({ title, text }: any) => {
  const { Text } = require('react-native');
  return <Text>{title} {text}</Text>;
} }));
jest.mock('@/lib/geo', () => ({ syncTracking: jest.fn(() => Promise.resolve()), pingNow: jest.fn(() => Promise.resolve()), requestGeoPermission: jest.fn() }));
jest.mock('expo-location', () => ({ getForegroundPermissionsAsync: jest.fn(), getBackgroundPermissionsAsync: jest.fn(), hasServicesEnabledAsync: jest.fn() }));

beforeEach(() => {
  jest.mocked(syncTracking).mockResolvedValue(undefined);
  jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({ granted: true } as any);
  jest.mocked(Location.getBackgroundPermissionsAsync).mockResolvedValue({ granted: true } as any);
});

it('does not claim sharing is on when the native tracker fails to start', async () => {
  jest.mocked(Location.hasServicesEnabledAsync).mockResolvedValue(true);
  jest.mocked(syncTracking).mockRejectedValue(new Error('Native service failed'));
  await render(<GeoPanel trackLocation />);
  expect(screen.getByText(/loc.child.failed.title/)).toBeTruthy();
  expect(screen.queryByText(/loc.child.on.title/)).toBeNull();
});

it('shows disabled device location instead of claiming location is on', async () => {
  jest.mocked(Location.hasServicesEnabledAsync).mockResolvedValue(false);
  await render(<GeoPanel trackLocation />);
  expect(screen.getByText(/loc.child.off.title/)).toBeTruthy();
  expect(screen.queryByText(/loc.child.on.title/)).toBeNull();
});

it('shows sharing status when device location and permissions are enabled', async () => {
  jest.mocked(Location.hasServicesEnabledAsync).mockResolvedValue(true);
  await render(<GeoPanel trackLocation />);
  expect(screen.getByText(/loc.child.on.title/)).toBeTruthy();
});

