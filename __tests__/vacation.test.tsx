import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { dayLabel, MonthCalendar, offGlyph } from '@/components/MonthCalendar';
import { VacationSheet } from '@/components/VacationSheet';
import { api, ApiError, type CalendarDay } from '@/lib/api';
import { shortDate } from '@/lib/format';
import { t, tn } from '@/lib/i18n';
import { addDaysIso, listedVacations, normPromo, promoLooksValid, promoSuccess, rangeBounds, rangeLabel, rangeProblem, vacationLine, withFrom } from '@/lib/vacation';

import { applyEnv, MATRIX } from './helpers';

// The system date picker is native: a plain view that forwards onChange stands in for it (iOS compact mode).
jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = jest.requireActual('react-native');
  const Picker = (props: { testID?: string; accessibilityLabel?: string; onChange?: unknown }) => <View testID={props.testID} accessibilityLabel={props.accessibilityLabel} onChange={props.onChange} />;
  return { __esModule: true, default: Picker, DateTimePickerAndroid: { open: jest.fn() } };
});
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  api: { daysOffRange: jest.fn() },
}));

const TODAY = '2026-10-27';

describe('vacation helpers (pure)', () => {
  it('range limits mirror the server: order, 120 days, today-30 … today+400', () => {
    expect(rangeProblem('2026-12-29', '2027-01-11', TODAY)).toBeNull();
    expect(rangeProblem('2027-01-11', '2026-12-29', TODAY)).toBe('parent.vac.errOrder');
    expect(rangeProblem('2027-06-01', addDaysIso('2027-06-01', 119), TODAY)).toBeNull();
    expect(rangeProblem('2027-06-01', addDaysIso('2027-06-01', 120), TODAY)).toBe('parent.vac.errLong');
    expect(rangeProblem('2026-09-26', '2026-09-30', TODAY)).toBe('parent.vac.errWindow');
    expect(rangeProblem('2027-12-01', '2027-12-02', TODAY)).toBe('parent.vac.errWindow');
    expect(rangeBounds(TODAY)).toEqual({ min: '2026-09-27', max: '2027-12-01', toMin: '2026-09-27', toMax: '2027-12-01' });
    expect(rangeBounds(TODAY, '2027-06-01').toMax).toBe('2027-09-28');
  });

  it('moving the start drags the end along instead of making the range invalid', () => {
    expect(withFrom({ from: '2026-11-01', to: '2026-11-05' }, '2026-12-29', TODAY)).toEqual({ from: '2026-12-29', to: '2026-12-29' });
    expect(withFrom({ from: '2026-11-01', to: '2027-08-31' }, '2027-06-01', TODAY)).toEqual({ from: '2027-06-01', to: '2027-08-31' });
    expect(withFrom({ from: '2026-06-01', to: '2027-12-01' }, '2027-06-01', TODAY).to).toBe('2027-09-28');
  });

  it('lists breaks that are not over, without lone unnamed days the chips already show', () => {
    const list = [
      { from: '2026-10-20', to: '2026-10-23', note: 'Осенние каникулы', days: 4 },
      { from: '2026-11-06', to: '2026-11-06', note: null, days: 1 },
      { from: '2026-11-09', to: '2026-11-10', note: null, days: 2 },
      { from: '2027-02-15', to: '2027-02-15', note: null, days: 1 },
      { from: '2026-12-29', to: '2027-01-11', note: 'Зимние каникулы', days: 14 },
    ];
    expect(listedVacations(list, TODAY, ['2026-11-06']).map((v) => v.from)).toEqual(['2026-11-09', '2027-02-15', '2026-12-29']);
    expect(listedVacations(undefined, TODAY, [])).toEqual([]);
  });

  it('promo codes: typed form → stored form, plausibility, success line', async () => {
    await applyEnv({ width: 390, height: 844, lang: 'ru' });
    expect(normPromo(' k7m2-qx9r ')).toBe('K7M2QX9R');
    expect(promoLooksValid('k7m2 qx9r')).toBe(true);
    expect(promoLooksValid('ZIMA2026')).toBe(false); // I and 0 are not in the alphabet
    expect(promoLooksValid('ABC')).toBe(false);
    expect(promoSuccess({ free_forever: true, granted_until: null })).toBe(t('parent.promo.forever'));
    expect(promoSuccess({ free_forever: false, granted_until: '2027-10-27T10:00:00Z' })).toBe(t('parent.promo.until', { date: shortDate('2027-10-27') }));
  });
});

describe.each(MATRIX)('VacationSheet · $label', ({ width, height, lang }) => {
  beforeEach(() => applyEnv({ width, height, lang }));

  it('two dates, a name with quick chips, the day count; saves the range in one call', async () => {
    jest.mocked(api.daysOffRange).mockResolvedValue({ ok: true, from: '2026-12-29', to: '2027-01-11', off: true, days: 14, note: null });
    const onSaved = jest.fn();
    await render(<VacationSheet visible today={TODAY} onClose={() => {}} onSaved={onSaved} />);
    for (const k of ['autumn', 'winter', 'spring', 'summer']) expect(screen.getByText(t(`parent.vac.p.${k}`))).toBeOnTheScreen();
    // default: tomorrow … a week from today
    expect(screen.getByText(tn('parent.vac.summary', 7))).toBeOnTheScreen();
    await fireEvent(screen.getByTestId(`date-${t('parent.vac.from')}`), 'change', {}, new Date(2026, 11, 29, 12));
    // the end moved along with the start
    expect(screen.getByText(tn('parent.vac.summary', 1))).toBeOnTheScreen();
    await fireEvent(screen.getByTestId(`date-${t('parent.vac.to')}`), 'change', {}, new Date(2027, 0, 11, 12));
    expect(screen.getByText(tn('parent.vac.summary', 14))).toBeOnTheScreen();
    await fireEvent.press(screen.getByText(t('parent.vac.p.winter')));
    await fireEvent.press(screen.getByRole('button', { name: t('parent.vac.save') }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(t('parent.vac.saved')));
    expect(api.daysOffRange).toHaveBeenCalledWith('2026-12-29', '2027-01-11', true, t('parent.vac.pn.winter'));
  });
});

describe('VacationSheet behaviour', () => {
  beforeEach(() => applyEnv({ width: 390, height: 844, lang: 'ru' }));

  it('a server refusal stays in the sheet, translated', async () => {
    jest.mocked(api.daysOffRange).mockRejectedValueOnce(new ApiError('Не больше 120 дней за раз', 400));
    const onSaved = jest.fn();
    await render(<VacationSheet visible today={TODAY} onClose={() => {}} onSaved={onSaved} />);
    await fireEvent.press(screen.getByRole('button', { name: t('parent.vac.save') }));
    expect(await screen.findByText('Не больше 120 дней за раз')).toBeOnTheScreen();
    expect(onSaved).not.toHaveBeenCalled();
    // no name typed: none is sent
    expect(api.daysOffRange).toHaveBeenCalledWith('2026-10-28', '2026-11-03', true, null);
  });

  it('rows of the schedule list: the name or "days off", dates and the day count', () => {
    const line = vacationLine({ from: '2026-12-29', to: '2027-01-11', note: null, days: 14 });
    expect(line.title).toBe(t('parent.vac.unnamed'));
    expect(line.subtitle).toBe(`${rangeLabel('2026-12-29', '2027-01-11')} · ${tn('parent.vac.days', 14)}`);
    expect(rangeLabel('2026-11-06', '2026-11-06')).toBe(shortDate('2026-11-06'));
  });
});

describe('MonthCalendar shows days off', () => {
  beforeEach(() => applyEnv({ width: 390, height: 844, lang: 'ru' }));
  const days: CalendarDay[] = [
    { date: '2026-12-16', status: 'off', total: 0, done: 0, off: 'holiday', note: null },
    { date: '2026-12-19', status: 'off', total: 0, done: 0, off: 'weekend', note: null },
    { date: '2026-12-29', status: 'off', total: 0, done: 0, off: 'day_off', note: 'Зимние каникулы' },
    { date: '2026-12-30', status: 'off', total: 0, done: 0, off: 'day_off', note: null },
    { date: '2026-12-28', status: 'future', total: 3, done: 0 },
  ];

  it('a break announces its name, a holiday reads as a holiday, weekends stay "day off"; the legend explains the glyphs', async () => {
    await render(<MonthCalendar month="2026-12" days={days} today="2026-10-27" selected={null} onSelect={() => {}} onMonth={() => {}} />);
    expect(screen.getByTestId('cal-2026-12-29').props.accessibilityLabel).toContain(`${t('parent.cal.offDay')}: Зимние каникулы`);
    expect(screen.getByTestId('cal-2026-12-30').props.accessibilityLabel).toContain(t('parent.cal.offDay'));
    expect(screen.getByTestId('cal-2026-12-16').props.accessibilityLabel).toContain(t('parent.cal.holiday'));
    expect(screen.getByTestId('cal-2026-12-19').props.accessibilityLabel).toContain(t('parent.cal.st.off'));
    expect(screen.getByText(t('parent.cal.offDay'))).toBeOnTheScreen();
    expect(screen.getByText(t('parent.cal.holiday'))).toBeOnTheScreen();
  });

  it('labels and glyphs (pure)', () => {
    expect(dayLabel(t, days[4])).toBe(t('parent.cal.st.future'));
    expect(dayLabel(t, undefined)).toBe(t('parent.cal.st.empty'));
    expect(days.map(offGlyph)).toEqual(['flag-outline', null, 'bed-outline', 'bed-outline', null]);
  });
});
