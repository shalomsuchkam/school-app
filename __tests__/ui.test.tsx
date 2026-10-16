import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { CONTENT_MAX, ErrorBanner, Loading, Screen, Sheet, useLayout } from '@/components/ui';
import { t } from '@/lib/i18n';

import { applyEnv, flat, MATRIX } from './helpers';

// The content column of Screen / the loading skeleton: never wider than CONTENT_MAX plus the side padding, centred.
function expectColumn(style: Record<string, unknown>, width: number) {
  const max = style.maxWidth as number;
  const pad = style.paddingHorizontal as number | undefined;
  expect(max).toBeLessThanOrEqual(CONTENT_MAX + 2 * 24);
  if (pad !== undefined) {
    expect(max).toBe(CONTENT_MAX + 2 * pad);
    expect(pad).toBe(width >= 600 ? 24 : 16);
  }
  expect(style.alignSelf).toBe('center');
  // the text column itself is never wider than CONTENT_MAX
  expect(Math.min(width, max) - 2 * (pad ?? 0)).toBeLessThanOrEqual(CONTENT_MAX);
}

function LayoutProbe() {
  const { wide, pad } = useLayout();
  return <Text testID="probe">{`${wide ? 'wide' : 'narrow'}:${pad}`}</Text>;
}

describe.each(MATRIX)('ui building blocks · $label', ({ width, height, lang }) => {
  beforeEach(() => applyEnv({ width, height, lang }));

  it('useLayout switches to the wide layout from 700pt and pads 16/24', async () => {
    await render(<LayoutProbe />);
    expect(screen.getByTestId('probe')).toHaveTextContent(`${width >= 700 ? 'wide' : 'narrow'}:${width >= 600 ? 24 : 16}`);
  });

  it('Screen renders title, subtitle and content in a centred column capped at CONTENT_MAX', async () => {
    await render(
      <Screen title={t('parent.report.title')} subtitle="1 — 7">
        <Text>body</Text>
      </Screen>,
    );
    expect(screen.getByText(t('parent.report.title'))).toBeOnTheScreen();
    expect(screen.getByText('body')).toBeOnTheScreen();
    const scroll = screen.root!.queryAll((n) => !!n.props.contentContainerStyle, { includeSelf: true })[0];
    expectColumn(flat(scroll.props.contentContainerStyle), width);
  });

  it('ErrorBanner shows the translated error with a retry button, nothing without an error', async () => {
    const retry = jest.fn();
    const { rerender } = await render(<ErrorBanner error="Boom" onRetry={retry} />);
    expect(screen.getByText(t('common.loadFail', { error: 'Boom' }))).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: t('common.retry') })).toBeOnTheScreen();
    // a live region so screen readers announce it (not a focusable element, so query by prop)
    const alerts = () => screen.root?.queryAll((n) => n.props.accessibilityRole === 'alert', { includeSelf: true }) ?? [];
    expect(alerts()).toHaveLength(1);
    await rerender(<ErrorBanner error={null} onRetry={retry} />);
    expect(alerts()).toHaveLength(0);
  });

  it('Loading shows a busy skeleton capped at CONTENT_MAX, or the error with retry', async () => {
    const { rerender } = await render(<Loading />);
    const busy = screen.getByRole('progressbar', { name: t('common.loading') });
    const column = busy.queryAll((n) => flat(n.props.style).maxWidth !== undefined)[0];
    expectColumn(flat(column.props.style), width);
    await rerender(<Loading error={t('common.offline')} onRetry={() => {}} />);
    expect(screen.getByText(t('common.offline'))).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: t('common.retry') })).toBeOnTheScreen();
  });

  it('Sheet fits the window: at most 600pt wide and never taller than the screen', async () => {
    await render(
      <Sheet visible title={t('child.logout.title')} onClose={() => {}}>
        <Text>sheet body</Text>
      </Sheet>,
    );
    expect(screen.getByText(t('child.logout.title'))).toBeOnTheScreen();
    expect(screen.getByText('sheet body')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: t('common.close') })).toBeOnTheScreen();
    const panel = screen.root!.queryAll((n) => flat(n.props.style).maxWidth === 600, { includeSelf: true })[0];
    const st = flat(panel.props.style);
    expect(st.maxHeight as number).toBeLessThanOrEqual(height);
    expect(st.maxHeight as number).toBeGreaterThan(0);
  });
});
