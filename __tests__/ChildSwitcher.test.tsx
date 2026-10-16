import { fireEvent, render, screen } from '@testing-library/react-native';

import type { Child } from '@/lib/api';
import { ChildSwitcher } from '@/lib/currentChild';
import { t } from '@/lib/i18n';

import { applyEnv, MATRIX } from './helpers';

const KIDS: Child[] = [
  { id: 1, name: 'Алия', pos: 0 },
  { id: 2, name: 'Тимур', pos: 1 },
  { id: 3, name: 'Very Long Name Of A Third Child', pos: 2 },
];

describe.each(MATRIX)('ChildSwitcher · $label', ({ width, height, lang }) => {
  beforeEach(() => applyEnv({ width, height, lang }));

  it('renders nothing for a single child', async () => {
    await render(<ChildSwitcher list={KIDS.slice(0, 1)} value={1} onChange={() => {}} />);
    expect(screen.toJSON()).toBeNull();
  });

  it('shows a chip per child (selected one marked) in a horizontal scroller, plus "all" when asked', async () => {
    const onChange = jest.fn();
    await render(<ChildSwitcher list={KIDS} value={2} onChange={onChange} all />);
    for (const k of KIDS) expect(screen.getByRole('button', { name: k.name })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Тимур' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Алия' })).not.toBeSelected();
    expect(screen.getByRole('button', { name: t('parent.kids.all') })).not.toBeSelected();
    // long names scroll sideways instead of squeezing the layout on narrow phones
    const scroller = screen.root!.queryAll((n) => n.props.horizontal === true, { includeSelf: true });
    expect(scroller).toHaveLength(1);
    expect(scroller[0].props.accessibilityLabel).toBe(t('parent.kids.switchA11y'));
    await fireEvent.press(screen.getByRole('button', { name: 'Алия' }));
    await fireEvent.press(screen.getByRole('button', { name: t('parent.kids.all') }));
    expect(onChange.mock.calls).toEqual([[1], [null]]);
  });
});
