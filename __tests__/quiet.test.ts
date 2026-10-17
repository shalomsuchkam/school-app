jest.mock('expo-notifications', () => ({ setNotificationHandler: jest.fn(), SchedulableTriggerInputTypes: { DATE: 'date' }, AndroidImportance: { HIGH: 4 } }));

import type { ChildState } from '@/lib/api';
import { daySlots } from '@/lib/notify';
import { inQuiet, isValidQuiet, outsideQuiet } from '@/lib/quiet';

const m = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));

describe('quiet hours', () => {
  it('a window inside one day: start inside, end outside', () => {
    const q = { from: '13:00', to: '15:00' };
    expect(inQuiet(m('12:59'), q)).toBe(false);
    expect(inQuiet(m('13:00'), q)).toBe(true);
    expect(inQuiet(m('14:59'), q)).toBe(true);
    expect(inQuiet(m('15:00'), q)).toBe(false);
  });

  it('a window across midnight', () => {
    const q = { from: '21:30', to: '07:00' };
    expect(inQuiet(m('21:29'), q)).toBe(false);
    expect(inQuiet(m('21:30'), q)).toBe(true);
    expect(inQuiet(m('23:45'), q)).toBe(true);
    expect(inQuiet(m('00:00'), q)).toBe(true);
    expect(inQuiet(m('06:59'), q)).toBe(true);
    expect(inQuiet(m('07:00'), q)).toBe(false);
    expect(inQuiet(m('16:00'), q)).toBe(false);
  });

  it('off, half-set, malformed or equal windows silence nothing', () => {
    for (const q of [null, undefined, { from: null, to: null }, { from: '21:00', to: null }, { from: '25:00', to: '07:00' }, { from: '21:00', to: '21:00' }]) {
      expect(isValidQuiet(q)).toBe(false);
      expect(inQuiet(m('22:00'), q)).toBe(false);
    }
  });

  it('filters a list of reminder times', () => {
    const list = ['16:00', '20:30', '21:00', '22:00'].map((hm) => ({ m: m(hm), hm }));
    expect(outsideQuiet(list, { from: '21:00', to: '07:00' }).map((x) => x.hm)).toEqual(['16:00', '20:30']);
  });
});

describe('scheduled reminders skip the quiet window', () => {
  const s = {
    remind_times: ['16:00', '21:15'],
    soft: '21:00',
    hard: '22:30',
    tz: 'Asia/Almaty',
  } as unknown as ChildState;

  it('without quiet hours every slot is scheduled', () => {
    const hms = daySlots(s, '2026-10-19', 'Математика').map((x) => x.id.slice(-5));
    // reminders, 30 min before soft, at soft, an hour before hard
    expect(hms.sort()).toEqual(['16:00', '20:30', '21:00', '21:15', '21:30'].sort());
  });

  it('slots inside 21:00–07:00 are dropped (and never moved later)', () => {
    const hms = daySlots(s, '2026-10-19', 'Математика', { from: '21:00', to: '07:00' }).map((x) => x.id.slice(-5));
    expect(hms.sort()).toEqual(['16:00', '20:30']);
  });

  it('a daytime window drops only what falls inside it', () => {
    const hms = daySlots(s, '2026-10-19', null, { from: '15:30', to: '16:30' }).map((x) => x.id.slice(-5));
    expect(hms).not.toContain('16:00');
    expect(hms).toContain('20:30');
  });
});
