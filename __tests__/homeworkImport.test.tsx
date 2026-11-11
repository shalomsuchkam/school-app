import { fireEvent, render, screen } from '@testing-library/react-native';
import { Clipboard } from 'react-native';

import HomeworkImport from '@/app/parent/bilimclass';
import { api } from '@/lib/api';
import { t } from '@/lib/i18n';

import { applyEnv } from './helpers';

jest.mock('expo-router', () => ({
  router: { canGoBack: () => false, replace: jest.fn() },
  Redirect: () => null,
  useFocusEffect: function useFocusEffect(callback: () => void) {
    require('react').useEffect(callback, [callback]);
  },
}));
jest.mock('@/lib/auth', () => ({ useIsViewer: () => false }));
jest.mock('@/lib/currentChild', () => ({
  ChildSwitcher: () => null,
  currentChildReady: () => Promise.resolve(1),
  getCurrentChild: () => 1,
  setCurrentChild: jest.fn(),
  useCurrentChild: () => [1],
}));
jest.mock('@/lib/storage', () => ({ storage: { get: () => Promise.resolve(null), set: () => Promise.resolve() } }));
jest.mock('@/lib/api', () => ({
  api: { setup: jest.fn(), overview: jest.fn(), me: jest.fn(), parentNote: jest.fn() },
}));

beforeEach(() => {
  applyEnv({ width: 390, height: 844, lang: 'en' });
  jest.mocked(api.setup).mockResolvedValue({ child_id: 1, subjects: [{ id: 10, name: 'Maths', emoji: '📐' }] } as never);
  jest.mocked(api.overview).mockResolvedValue({ active: '2026-11-13', days: [{ date: '2026-11-13', tasks: [{ id: 22, kind: 'lesson', label: 'Maths' }] }] } as never);
  jest.mocked(api.me).mockResolvedValue({ children: [] } as never);
  jest.mocked(api.parentNote).mockResolvedValue({} as never);
});

it('reads clipboard only on explicit request, previews the exact bounded note, and writes only on confirmation', async () => {
  const clipboard = jest.spyOn(Clipboard, 'getString').mockResolvedValue('Maths: ' + 'x'.repeat(320));
  await render(<HomeworkImport />);
  await screen.findByText(t('parent.bc.intro'));
  expect(clipboard).not.toHaveBeenCalled();
  expect(api.parentNote).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: t('parent.bc.paste') }));
  expect(clipboard).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: t('parent.bc.pasteFrom') }));
  expect(clipboard).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: t('parent.bc.parse') }));
  expect(screen.getByText('x'.repeat(300))).toBeOnTheScreen();
  expect(screen.getByText(t('parent.bc.previewLimit', { n: 300 }))).toBeOnTheScreen();
  expect(api.parentNote).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: t('parent.bc.confirm', { n: 1 }) }));
  expect(api.parentNote).toHaveBeenCalledWith(22, 'x'.repeat(300));
  clipboard.mockRestore();
});
