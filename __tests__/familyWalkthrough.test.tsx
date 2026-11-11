import { fireEvent, render, screen } from '@testing-library/react-native';

import { FamilyWalkthrough } from '@/components/FamilyWalkthrough';
import { t } from '@/lib/i18n';

import { applyEnv, MATRIX } from './helpers';

describe.each(MATRIX)('public family walkthrough · $label', ({ width, height, lang }) => {
  beforeEach(() => applyEnv({ width, height, lang }));

  it('explains submission, correction and acceptance as distinct actions, then resets both exercises', async () => {
    await render(<FamilyWalkthrough />);
    expect(screen.getByText(t('walkthrough.disclosure'))).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: t('walkthrough.accept') })).toBeNull();
    for (const action of ['submit', 'requestCorrection', 'resubmit', 'accept']) {
      await fireEvent.press(screen.getByRole('button', { name: t(`walkthrough.${action}`) }));
    }
    expect(screen.getByText(t('walkthrough.state.accepted'))).toBeOnTheScreen();
    expect(screen.queryByText(t('walkthrough.complete'))).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: t('walkthrough.askSkip') }));
    expect(screen.getByText(t('walkthrough.skip.requested'))).toBeOnTheScreen();
    expect(screen.queryByText(t('walkthrough.complete'))).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: t('walkthrough.approveSkip') }));
    expect(screen.getByText(t('walkthrough.complete'))).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: t('walkthrough.reset') }));
    expect(screen.getByText(t('walkthrough.state.assigned'))).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: t('walkthrough.askSkip') })).toBeOnTheScreen();
    expect(screen.queryByText(t('walkthrough.complete'))).toBeNull();
  });
});
