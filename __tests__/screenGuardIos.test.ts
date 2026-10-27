import type { ScreenRules, ScreenState } from '@/lib/api';
import { ACT, appleWeekday, blockAt, iosLimit, planIos, SEL, shieldText, tzOffsetMin, type Clock, type IosPlan } from '@/lib/screenGuardIos';

// Monday 2026-10-26, 18:00 in Almaty (UTC+5); the phone is in the same zone unless a test says otherwise.
const NOW = Date.parse('2026-10-26T13:00:00Z');
const at = (hm: string, date = '2026-10-26') => Date.parse(`${date}T${hm}:00+05:00`);
const clock = (now = NOW, deviceOffset = 300): Clock => ({ now, familyOffset: 300, deviceOffset });
const ALL = { always: true, limited: true, window: true };

const rules = (over: Partial<ScreenRules> = {}): ScreenRules => ({
  child_id: 1,
  enabled: true,
  daily_limit_min: null,
  app_limits: [],
  blocked_apps: [],
  always_allowed: [],
  bedtime: null,
  school: null,
  homework_lock: false,
  homework_lock_from: '15:00',
  block_new_apps: false,
  unlock_until: null,
  updated_at: null,
  ...over,
});
const state = (r: Partial<ScreenRules> = {}, over: Partial<ScreenState> = {}): ScreenState => ({
  rules: rules(r),
  homework_done: false,
  homework_date: '2026-10-27',
  homework_due_today: true,
  tz: 'Asia/Almaty',
  textbooks: [],
  device: null,
  today: '2026-10-26',
  school_day: true,
  approved: [],
  new_apps: [],
  lang: 'ru',
  ...over,
});
const on = (p: IosPlan) => {
  if (p.kind !== 'on') throw new Error('plan is off');
  return p;
};
const act = (p: IosPlan, name: string) => on(p).activities.find((a) => a.name === name);

describe('planIos: off', () => {
  it('clears everything when the rules are off or the subscription lapsed (402)', () => {
    expect(planIos(state({ enabled: false }), clock(), ALL)).toEqual({ kind: 'off' });
    expect(planIos(null, clock(), ALL)).toEqual({ kind: 'off' });
  });
});

describe('planIos: bedtime and school', () => {
  const bed = { from: '21:30', to: '07:00', allowed: [] };
  const school = { from: '08:00', to: '14:00', days: [1, 2, 3, 4, 5], allowed: [] };

  it('schedules bedtime daily and keeps always + window apps open', () => {
    const a = act(planIos(state({ bedtime: bed }), clock(), ALL), ACT.bedtime);
    expect(a?.schedule).toEqual({ intervalStart: { hour: 21, minute: 30 }, intervalEnd: { hour: 7, minute: 0 }, repeats: true });
    expect(a?.start).toEqual([
      { type: 'clearWhitelist' },
      { type: 'addSelectionToWhitelist', familyActivitySelection: { activitySelectionId: SEL.always } },
      { type: 'addSelectionToWhitelist', familyActivitySelection: { activitySelectionId: SEL.window } },
      { type: 'enableBlockAllMode', shieldId: 'bedtime' },
    ]);
    expect(a?.end).toEqual([{ type: 'disableBlockAllMode' }]);
  });

  it('blocks right now inside a window that crosses midnight, leaving out selections that were not picked', () => {
    const s = state({ bedtime: bed });
    expect(blockAt(s, at('23:10'), clock(), { always: true, limited: false, window: false })).toEqual({ reason: 'bedtime', sels: ['always'], until: '07:00' });
    expect(blockAt(s, at('06:59', '2026-10-27'), clock(), ALL)?.reason).toBe('bedtime');
    expect(blockAt(s, at('07:00', '2026-10-27'), clock(), ALL)).toBeNull();
  });

  it('converts family times to the phone time zone', () => {
    const a = act(planIos(state({ bedtime: bed }), clock(NOW, 180), ALL), ACT.bedtime);
    expect(a?.schedule.intervalStart).toEqual({ hour: 19, minute: 30 });
    // Monday 01:00 at UTC+5 is Sunday 20:00 at UTC: Apple weekday 1
    const p = planIos(state({ school: { ...school, from: '01:00', to: '03:00', days: [1] } }), clock(NOW, 0), ALL);
    expect(on(p).activities[0].schedule.intervalStart).toEqual({ weekday: 1, hour: 20, minute: 0 });
  });

  it('schedules school once per listed weekday (Apple weekdays) and skips only today on a holiday', () => {
    const p = planIos(state({ school }, { school_day: false }), clock(), ALL);
    const names = on(p).activities.map((a) => a.name);
    expect(names).toEqual([1, 2, 3, 4, 5].map((d) => ACT.school(appleWeekday(d))));
    const monday = act(p, ACT.school(2));
    const tuesday = act(p, ACT.school(3));
    expect(monday?.start[0]).toEqual({ type: 'clearWhitelist', neverTriggerBefore: new Date(at('00:00', '2026-10-27')) });
    expect(tuesday?.start[0]).toEqual({ type: 'clearWhitelist' });
    expect(blockAt(state({ school }, { school_day: false }), at('09:00'), clock(), ALL)).toBeNull();
    expect(blockAt(state({ school }), at('09:00'), clock(), ALL)).toEqual({ reason: 'school', sels: ['always', 'window'], until: '14:00' });
  });
});

describe('planIos: homework lock', () => {
  it('locks everything but the always-allowed apps from homework_lock_from until midnight', () => {
    const p = planIos(state({ homework_lock: true }), clock(), ALL);
    expect(on(p).now).toEqual({ reason: 'homework', sels: ['always'] });
    const a = act(p, ACT.homework);
    expect(a?.schedule).toEqual({
      intervalStart: { year: 2026, month: 10, day: 26, hour: 15, minute: 0 },
      intervalEnd: { year: 2026, month: 10, day: 26, hour: 23, minute: 59 },
      repeats: false,
    });
    expect(a?.end).toEqual([{ type: 'disableBlockAllMode' }]);
  });

  it('hands over to bedtime later the same evening', () => {
    const a = act(planIos(state({ homework_lock: true, bedtime: { from: '21:30', to: '07:00', allowed: [] } }), clock(), ALL), ACT.homework);
    expect(a?.schedule.intervalEnd).toEqual({ year: 2026, month: 10, day: 26, hour: 21, minute: 30 });
    expect(a?.end).toEqual([]);
  });

  it('lifts as soon as the homework is done or not due', () => {
    for (const over of [{ homework_done: true }, { homework_due_today: false }]) {
      const p = planIos(state({ homework_lock: true }, over), clock(), ALL);
      expect(on(p).now).toBeNull();
      expect(act(p, ACT.homework)).toBeUndefined();
    }
  });
});

describe('planIos: limits, bonus time, new apps', () => {
  it('uses the daily limit, else the strictest per-app limit, over the "limited" selection', () => {
    expect(iosLimit(state({ daily_limit_min: 120, app_limits: [{ pkg: 'a', name: 'A', minutes: 30 }] }))).toEqual({ minutes: 120, reason: 'daily_limit' });
    expect(iosLimit(state({ app_limits: [{ pkg: 'a', name: 'A', minutes: 45 }, { pkg: 'b', name: 'B', minutes: 30 }] }))).toEqual({ minutes: 30, reason: 'app_limit' });
    const a = act(planIos(state({ daily_limit_min: 90 }), clock(), ALL), ACT.limit);
    expect(a?.event).toEqual({ name: 'limit_90', minutes: 90, actions: [{ type: 'blockSelection', familyActivitySelectionId: SEL.limited, shieldId: 'daily_limit' }] });
    expect(a?.start).toEqual([{ type: 'resetBlocks' }]);
    expect(act(planIos(state({ daily_limit_min: 90 }), clock(), { ...ALL, limited: false }), ACT.limit)).toBeUndefined();
  });

  it('opens the phone during bonus time and re-applies the block that holds when it ends', () => {
    const until = '2026-10-26T16:40:00Z'; // 21:40 local, inside bedtime
    const p = planIos(state({ unlock_until: until, homework_lock: true, daily_limit_min: 60, bedtime: { from: '21:30', to: '07:00', allowed: [] } }), clock(), ALL);
    expect(on(p).unlocked).toBe(true);
    expect(on(p).now).toBeNull();
    expect(act(p, ACT.homework)?.start[0]).toEqual({ type: 'clearWhitelist', neverTriggerBefore: new Date(until) });
    expect(act(p, ACT.limit)?.event?.actions[0]).toMatchObject({ neverTriggerBefore: new Date(until) });
    const end = act(p, ACT.unlockEnd);
    expect(end?.schedule.intervalStart).toEqual({ year: 2026, month: 10, day: 26, hour: 21, minute: 40 });
    expect(end?.start.at(-1)).toEqual({ type: 'enableBlockAllMode', shieldId: 'bedtime' });
  });

  it('ignores a bonus that already ended', () => {
    expect(on(planIos(state({ unlock_until: '2026-10-26T12:00:00Z' }), clock(), ALL)).unlocked).toBe(false);
  });

  it('passes block_new_apps on as "deny app installation"', () => {
    expect(on(planIos(state({ block_new_apps: true }), clock(), ALL)).denyInstall).toBe(true);
  });
});

describe('helpers', () => {
  it('reads time zone offsets', () => {
    expect(tzOffsetMin('Asia/Aqtobe', NOW)).toBe(300);
    expect(tzOffsetMin('UTC', NOW)).toBe(0);
  });
  it('writes shield texts in the family language', () => {
    expect(shieldText('bedtime', 'kk', '07:00')).toEqual({ title: 'Қазір болмайды', subtitle: 'Ұйқы уақыты. Телефон 07:00 дейін демалады.', button: 'Түсінікті' });
    expect(shieldText('daily_limit', 'ru', undefined, 90).subtitle).toBe('Дневной лимит экранного времени исчерпан (90 мин).');
    expect(shieldText('homework', 'en').title).toBe('Not now');
  });
});
