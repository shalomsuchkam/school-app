import { fireEvent, render, screen } from '@testing-library/react-native';

import { MonthCalendar, statusLabel } from '@/components/MonthCalendar';
import type { CalendarDay, CalendarStatus } from '@/lib/api';
import { addMonths, countStatuses, daysInMonth, monthGrid, monthTitle, STATUSES } from '@/lib/calendar';
import { t } from '@/lib/i18n';

import { applyEnv, MATRIX } from './helpers';

describe('month grid (pure)', () => {
  it('Monday first, padded to whole weeks', () => {
    // 1 October 2026 is a Thursday
    const g = monthGrid('2026-10');
    expect(g).toHaveLength(5);
    expect(g[0].slice(0, 3)).toEqual([null, null, null]);
    expect(g[0][3]).toEqual({ date: '2026-10-01', day: 1 });
    expect(g[4][5]).toEqual({ date: '2026-10-31', day: 31 });
    expect(g.every((w) => w.length === 7)).toBe(true);
    expect(g.flat().filter(Boolean)).toHaveLength(31);
  });

  it('months starting on Monday / ending on Sunday, leap Februaries', () => {
    // June 2026 starts on a Monday; February 2027 is 4 whole weeks (Mon 1 .. Sun 28)
    expect(monthGrid('2026-06')[0][0]).toEqual({ date: '2026-06-01', day: 1 });
    expect(monthGrid('2027-02')).toHaveLength(4);
    expect(daysInMonth('2028-02')).toBe(29);
    expect(daysInMonth('2026-02')).toBe(28);
  });

  it('month arithmetic across years', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-10', 0)).toBe('2026-10');
  });

  it('month titles via Intl in the app language, with a numeric fallback', () => {
    expect(monthTitle('2026-10', 'en-GB')).toBe('October 2026');
    expect(monthTitle('2026-10', 'ru-RU')).toMatch(/2026$/);
    expect(monthTitle('2026-10', 'xx-invalid-@@')).toMatch(/2026/);
  });

  it('counts statuses', () => {
    const c = countStatuses([
      { date: '2026-10-01', status: 'done_on_time', total: 3, done: 3 },
      { date: '2026-10-02', status: 'missed', total: 3, done: 0 },
      { date: '2026-10-03', status: 'off', total: 0, done: 0 },
    ]);
    expect(c.done_on_time).toBe(1);
    expect(c.missed).toBe(1);
    expect(c.partial).toBe(0);
  });
});

// October 2026 with every status represented.
const pattern: CalendarStatus[] = ['done_on_time', 'done_late', 'partial', 'off', 'off', 'missed', 'empty'];
const DAYS: CalendarDay[] = Array.from({ length: 31 }, (_, i) => {
  const d = i + 1;
  const status: CalendarStatus = d > 20 ? 'future' : pattern[i % 7];
  return { date: `2026-10-${String(d).padStart(2, '0')}`, status, total: status === 'off' ? 0 : 4, done: status === 'partial' ? 2 : status.startsWith('done') ? 4 : 0 };
});

describe.each(MATRIX)('MonthCalendar · $label', ({ width, height, lang }) => {
  beforeEach(() => applyEnv({ width, height, lang }));

  it('31 day buttons announcing their status, a localized month title and a full legend', async () => {
    await render(<MonthCalendar month="2026-10" days={DAYS} today="2026-10-17" selected={null} onSelect={() => {}} onMonth={() => {}} />);
    const day1 = screen.getByTestId('cal-2026-10-01');
    expect(day1.props.accessibilityLabel).toContain(t('parent.cal.st.done_on_time'));
    expect(screen.getByTestId('cal-2026-10-03').props.accessibilityLabel).toContain(t('parent.cal.st.partial'));
    expect(screen.getByTestId('cal-2026-10-17').props.accessibilityLabel.startsWith(t('parent.cal.today'))).toBe(true);
    expect(screen.getByTestId('cal-2026-10-25').props.accessibilityLabel).toContain(t('parent.cal.st.future'));
    expect(screen.queryByTestId('cal-2026-10-32')).toBeNull();
    expect(screen.getByText(/2026/)).toBeOnTheScreen();
    for (const s of STATUSES) expect(screen.getAllByText(t(statusLabel(s))).length).toBeGreaterThan(0);
  });

  it('tapping a day selects it; the arrows step months', async () => {
    const onSelect = jest.fn();
    const onMonth = jest.fn();
    await render(<MonthCalendar month="2026-10" days={DAYS} today="2026-10-17" selected="2026-10-05" onSelect={onSelect} onMonth={onMonth} />);
    expect(screen.getByTestId('cal-2026-10-05')).toBeSelected();
    await fireEvent.press(screen.getByTestId('cal-2026-10-12'));
    expect(onSelect).toHaveBeenCalledWith('2026-10-12');
    await fireEvent.press(screen.getByRole('button', { name: t('parent.cal.prev') }));
    await fireEvent.press(screen.getByRole('button', { name: t('parent.cal.next') }));
    expect(onMonth.mock.calls).toEqual([[-1], [1]]);
  });

  it('days missing from the response read as "no tasks"', async () => {
    await render(<MonthCalendar month="2026-11" days={[]} today={null} selected={null} onSelect={() => {}} onMonth={() => {}} />);
    expect(screen.getByTestId('cal-2026-11-30').props.accessibilityLabel).toContain(t('parent.cal.st.empty'));
  });
});
