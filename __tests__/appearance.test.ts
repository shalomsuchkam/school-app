import { isNight, msToNextSwitch, resolveScheme, schemeFor } from '@/lib/appearance';

const at = (h: number, m = 0) => new Date(2026, 9, 17, h, m, 0, 0);

describe('theme schedule', () => {
  it('night is 20:00 (inclusive) to 07:00 (exclusive), local time', () => {
    expect(isNight(at(19, 59))).toBe(false);
    expect(isNight(at(20, 0))).toBe(true);
    expect(isNight(at(23, 30))).toBe(true);
    expect(isNight(at(0, 0))).toBe(true);
    expect(isNight(at(6, 59))).toBe(true);
    expect(isNight(at(7, 0))).toBe(false);
    expect(isNight(at(12, 0))).toBe(false);
  });

  it('resolves each mode', () => {
    expect(resolveScheme('light', 'dark', at(22))).toBe('light');
    expect(resolveScheme('dark', 'light', at(12))).toBe('dark');
    expect(resolveScheme('system', 'dark', at(12))).toBe('dark');
    expect(resolveScheme('system', null, at(22))).toBe('light');
    expect(resolveScheme('schedule', 'light', at(21))).toBe('dark');
    expect(resolveScheme('schedule', 'dark', at(9))).toBe('light');
  });

  it('the stored state: schedule follows the night flag, system follows the phone', () => {
    expect(schemeFor({ mode: 'schedule', night: true, bigText: false }, 'light')).toBe('dark');
    expect(schemeFor({ mode: 'schedule', night: false, bigText: false }, 'dark')).toBe('light');
    expect(schemeFor({ mode: 'system', night: true, bigText: false }, 'light')).toBe('light');
  });

  it('times the next switch at 07:00 or 20:00', () => {
    expect(msToNextSwitch(at(19, 0))).toBe(60 * 60_000);
    expect(msToNextSwitch(at(6, 30))).toBe(30 * 60_000);
    expect(msToNextSwitch(at(21, 0))).toBe(10 * 60 * 60_000);
    expect(msToNextSwitch(at(12, 0))).toBe(8 * 60 * 60_000);
  });
});
