import Constants from 'expo-constants';
import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import type { ScreenState } from './api';

// iOS screen time through Apple's Screen Time API (react-native-device-activity), docs/SCREEN_TIME.md "iOS".
// Apple gives no package names and no usage numbers: on the child's iPhone the parent picks three selections with
// Apple's picker (stored on the device), and this file turns the server rules into DeviceActivity schedules,
// threshold events and shields. The extensions run the scheduled steps while «Уроки» is closed; everything is
// also recomputed on every rules fetch and app foreground.
//
// Off unless the build has the iosScreenTime flag (app.config.ts): without it the native extensions and the
// entitlement are not in the app, so nothing here touches the native modules.

// ---------- pure planning (unit-tested) ----------

/** The three on-device selections, chosen with Apple's picker on the child's phone. */
export const SEL = { always: 'uroki_always', limited: 'uroki_limited', window: 'uroki_window' } as const;
export type SelKey = keyof typeof SEL;
export type IosReason = 'bedtime' | 'school' | 'homework' | 'app_limit' | 'daily_limit';

/** Every DeviceActivity name starts with this, so stale ones can be found and stopped. */
export const ACT_PREFIX = 'uroki_';
// the limit activity name contains the "limited" selection id: the library then shows that selection's shield
export const ACT = { bedtime: 'uroki_bedtime', homework: 'uroki_homework', limit: 'uroki_limited_daily', unlockEnd: 'uroki_unlock_end', school: (appleWd: number) => `uroki_school_${appleWd}` };

type DC = { year?: number; month?: number; day?: number; weekday?: number; hour?: number; minute?: number; second?: number };
type SelInput = { activitySelectionId: string };
type Common = { neverTriggerBefore?: Date };
export type PlanAction =
  | ({ type: 'clearWhitelist' } & Common)
  | ({ type: 'addSelectionToWhitelist'; familyActivitySelection: SelInput } & Common)
  | ({ type: 'enableBlockAllMode'; shieldId: string } & Common)
  | ({ type: 'disableBlockAllMode' } & Common)
  | ({ type: 'blockSelection'; familyActivitySelectionId: string; shieldId: string } & Common)
  | ({ type: 'resetBlocks' } & Common);

export type ActivityPlan = {
  name: string;
  schedule: { intervalStart: DC; intervalEnd: DC; repeats: boolean };
  start: PlanAction[];
  end: PlanAction[];
  /** threshold over the "limited" selection (the only event kind used) */
  event?: { name: string; minutes: number; actions: PlanAction[] };
  /** monitoring is restarted only when this changes (restarting re-runs intervalDidStart) */
  key: string;
};

export type NowBlock = { reason: IosReason; sels: SelKey[]; until?: string };
export type IosPlan =
  | { kind: 'off' }
  | {
      kind: 'on';
      /** what the shield must be right now (null = only the limit block, if any) */
      now: NowBlock | null;
      unlocked: boolean;
      limit: { minutes: number; reason: 'app_limit' | 'daily_limit' } | null;
      activities: ActivityPlan[];
      denyInstall: boolean;
      /** HH:MM per reason, for the shield texts */
      untils: Partial<Record<IosReason, string>>;
    };

const MIN_INTERVAL = 15; // DeviceActivity rejects shorter intervals
const DAY = 1440;

export const hmToMin = (hm: string) => {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
};
const mod = (n: number, m: number) => ((n % m) + m) % m;
/** `[from, to)`, crossing midnight when from > to (docs/SCREEN_TIME.md). */
export const inWindow = (now: number, from: number, to: number) => (from < to ? now >= from && now < to : now >= from || now < to);
/** ISO weekday (1 = Monday) → Apple DateComponents weekday (1 = Sunday). */
export const appleWeekday = (iso: number) => (iso % 7) + 1;

/** UTC offset of a time zone at a moment, in minutes (Asia/Almaty → 300). Unknown zone → the device's. */
export function tzOffsetMin(tz: string, at: number): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(at));
    const v = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asUtc = Date.UTC(v('year'), v('month') - 1, v('day'), v('hour') % 24, v('minute'));
    return Math.round((asUtc - Math.floor(at / 60000) * 60000) / 60000);
  } catch {
    return -new Date(at).getTimezoneOffset();
  }
}

export type Clock = { now: number; familyOffset: number; deviceOffset: number };
export const clockFor = (tz: string, now = Date.now()): Clock => ({ now, familyOffset: tzOffsetMin(tz, now), deviceOffset: -new Date(now).getTimezoneOffset() });

/** Family-local minute of day, ISO weekday and YYYY-MM-DD of a moment. */
function familyLocal(at: number, c: Clock) {
  const d = new Date(at + c.familyOffset * 60000);
  const wd = d.getUTCDay() || 7;
  const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return { min: d.getUTCHours() * 60 + d.getUTCMinutes(), wd, date };
}
/** The moment of a family-local date + minute of day. */
const familyInstant = (date: string, min: number, c: Clock) => Date.parse(`${date}T00:00:00Z`) + (min - c.familyOffset) * 60000;
/** Device-local date components of a moment (schedules are in the device's time zone). */
function deviceDC(at: number, c: Clock, withDate: boolean): DC {
  const d = new Date(at + c.deviceOffset * 60000);
  const hm = { hour: d.getUTCHours(), minute: d.getUTCMinutes() };
  return withDate ? { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), ...hm } : hm;
}
/** A daily family HH:MM as a device-local hour/minute. */
const dailyDC = (min: number, c: Clock): DC => {
  const m = mod(min + c.deviceOffset - c.familyOffset, DAY);
  return { hour: Math.floor(m / 60), minute: m % 60 };
};
/** A weekly family (ISO weekday, minute) as a device-local Apple weekday/hour/minute. */
const weeklyDC = (isoWd: number, min: number, c: Clock): DC => {
  const w = mod((isoWd - 1) * DAY + min + c.deviceOffset - c.familyOffset, 7 * DAY);
  const m = w % DAY;
  return { weekday: appleWeekday(Math.floor(w / DAY) + 1), hour: Math.floor(m / 60), minute: m % 60 };
};

const whitelistBlock = (reason: IosReason, sels: SelKey[], opts: Common): PlanAction[] => [
  { type: 'clearWhitelist', ...opts },
  ...sels.map((s): PlanAction => ({ type: 'addSelectionToWhitelist', familyActivitySelection: { activitySelectionId: SEL[s] }, ...opts })),
  { type: 'enableBlockAllMode', shieldId: reason, ...opts },
];

/** The homework lock applies this evening (docs/SCREEN_TIME.md step 8). */
const homeworkActive = (s: ScreenState) => s.rules.homework_lock && s.homework_due_today && !s.homework_done;

/**
 * Which whole-phone block holds at a moment (steps 6–8: bedtime, then school, then homework), with the selections
 * that stay open. `has` = which selections exist on the device.
 */
export function blockAt(s: ScreenState, at: number, c: Clock, has: Record<SelKey, boolean>): NowBlock | null {
  const r = s.rules;
  const { min, wd, date } = familyLocal(at, c);
  const open = (keys: SelKey[]) => keys.filter((k) => has[k]);
  if (r.bedtime && inWindow(min, hmToMin(r.bedtime.from), hmToMin(r.bedtime.to))) return { reason: 'bedtime', sels: open(['always', 'window']), until: r.bedtime.to };
  // school_day is known for today only; another day counts as a school day when its weekday is listed
  const schoolDay = date === s.today ? s.school_day : true;
  if (r.school && schoolDay && r.school.days.includes(wd) && inWindow(min, hmToMin(r.school.from), hmToMin(r.school.to)))
    return { reason: 'school', sels: open(['always', 'window']), until: r.school.to };
  if (homeworkActive(s) && date === s.today && min >= hmToMin(r.homework_lock_from)) return { reason: 'homework', sels: open(['always']) };
  return null;
}

/** Limit for the "limited" selection: the daily limit, else the strictest per-app limit (one value on iOS, v1). */
export function iosLimit(s: ScreenState): { minutes: number; reason: 'app_limit' | 'daily_limit' } | null {
  const r = s.rules;
  if (r.daily_limit_min) return { minutes: r.daily_limit_min, reason: 'daily_limit' };
  if (r.app_limits.length) return { minutes: Math.min(...r.app_limits.map((l) => l.minutes)), reason: 'app_limit' };
  return null;
}

/**
 * Server rules → what the iPhone must do. `null` state = 402 (lapsed subscription): like `enabled:false`, everything
 * is cleared so a lapsed payment never locks the phone.
 */
export function planIos(s: ScreenState | null, c: Clock, has: Record<SelKey, boolean>): IosPlan {
  if (!s || !s.rules.enabled) return { kind: 'off' };
  const r = s.rules;
  const until = r.unlock_until ? Date.parse(r.unlock_until) : NaN;
  const unlocked = !Number.isNaN(until) && until > c.now;
  // a parent's bonus time: no scheduled block may start before it ends
  const opts: Common = unlocked ? { neverTriggerBefore: new Date(until) } : {};
  const open = (keys: SelKey[]) => keys.filter((k) => has[k]);
  const activities: ActivityPlan[] = [];
  const key = (o: object) => JSON.stringify(o);
  const today = familyLocal(c.now, c);
  const len = (from: number, to: number) => mod(to - from, DAY);

  if (r.bedtime && len(hmToMin(r.bedtime.from), hmToMin(r.bedtime.to)) >= MIN_INTERVAL) {
    const schedule = { intervalStart: dailyDC(hmToMin(r.bedtime.from), c), intervalEnd: dailyDC(hmToMin(r.bedtime.to), c), repeats: true };
    activities.push({ name: ACT.bedtime, schedule, start: whitelistBlock('bedtime', open(['always', 'window']), opts), end: [{ type: 'disableBlockAllMode' }], key: key(schedule) });
  }

  if (r.school && len(hmToMin(r.school.from), hmToMin(r.school.to)) >= MIN_INTERVAL) {
    const from = hmToMin(r.school.from);
    const to = hmToMin(r.school.to);
    // today is a listed weekday but a holiday / day off: skip today's run only
    const skipUntil = new Date(familyInstant(today.date, DAY, c));
    for (const wd of [...new Set(r.school.days)].sort()) {
      const holiday = wd === today.wd && !s.school_day;
      const later = holiday && (!opts.neverTriggerBefore || skipUntil > opts.neverTriggerBefore) ? { neverTriggerBefore: skipUntil } : opts;
      const start = weeklyDC(wd, from, c);
      const schedule = { intervalStart: start, intervalEnd: weeklyDC(from > to ? (wd % 7) + 1 : wd, to, c), repeats: true };
      activities.push({ name: ACT.school(start.weekday ?? appleWeekday(wd)), schedule, start: whitelistBlock('school', open(['always', 'window']), later), end: [{ type: 'disableBlockAllMode' }], key: key(schedule) });
    }
  }

  if (homeworkActive(s)) {
    const from = hmToMin(r.homework_lock_from);
    const bed = r.bedtime ? { from: hmToMin(r.bedtime.from), to: hmToMin(r.bedtime.to) } : null;
    // inside bedtime the bedtime rules win (step 6 before step 8); bedtime later this evening takes over from it
    if (!bed || !inWindow(from, bed.from, bed.to)) {
      const endsAtBed = !!bed && bed.from > from;
      const end = endsAtBed && bed ? bed.from : DAY - 1;
      const startAt = familyInstant(today.date, from, c);
      const endAt = familyInstant(today.date, end, c);
      if (end - from >= MIN_INTERVAL && endAt > c.now) {
        const schedule = { intervalStart: deviceDC(startAt, c, true), intervalEnd: deviceDC(endAt, c, true), repeats: false };
        activities.push({
          name: ACT.homework,
          schedule,
          start: whitelistBlock('homework', open(['always']), opts),
          end: endsAtBed ? [] : [{ type: 'disableBlockAllMode' }],
          key: key(schedule),
        });
      }
    }
  }

  const limit = has.limited ? iosLimit(s) : null;
  if (limit) {
    // the day restarts the threshold; includesPastActivity re-fires it at once when monitoring restarts after a change
    const schedule = { intervalStart: { hour: 0, minute: 0 }, intervalEnd: { hour: 23, minute: 59 }, repeats: true };
    const event = { name: `limit_${limit.minutes}`, minutes: limit.minutes, actions: [{ type: 'blockSelection', familyActivitySelectionId: SEL.limited, shieldId: limit.reason, ...opts } as PlanAction] };
    activities.push({ name: ACT.limit, schedule, start: [{ type: 'resetBlocks' }], end: [], event, key: key({ schedule, event: event.name, unlocked }) });
  }

  if (unlocked) {
    // when the bonus ends: the block that holds at that moment (an exhausted limit returns at the next app start)
    const b = blockAt(s, until, c, has);
    if (b) {
      const schedule = { intervalStart: deviceDC(until, c, true), intervalEnd: deviceDC(until + MIN_INTERVAL * 60000, c, true), repeats: false };
      activities.push({ name: ACT.unlockEnd, schedule, start: whitelistBlock(b.reason, b.sels, {}), end: [], key: key(schedule) });
    }
  }

  return {
    kind: 'on',
    now: unlocked ? null : blockAt(s, c.now, c, has),
    unlocked,
    limit,
    activities,
    denyInstall: r.block_new_apps,
    untils: { ...(r.bedtime ? { bedtime: r.bedtime.to } : {}), ...(r.school ? { school: r.school.to } : {}) },
  };
}

/** Shield texts (title «Сейчас нельзя», reasons as on Android's GuardText) in the family language. */
export function shieldText(reason: IosReason, lang: string, until?: string, limitMin?: number) {
  const L = lang === 'kk' ? 1 : lang === 'en' ? 2 : 0;
  const t = (ru: string, kk: string, en: string) => [ru, kk, en][L];
  const subtitle = {
    bedtime: until ? t(`Время сна. Телефон отдыхает до ${until}.`, `Ұйқы уақыты. Телефон ${until} дейін демалады.`, `Bedtime. The phone rests until ${until}.`) : t('Время сна.', 'Ұйқы уақыты.', 'Bedtime.'),
    school: until ? t(`Идут уроки (до ${until}).`, `Сабақ уақыты (${until} дейін).`, `School time (until ${until}).`) : t('Идут уроки.', 'Сабақ уақыты.', 'School time.'),
    homework: t('Сначала сделай домашнее задание в «Уроках».', 'Алдымен «Уроки» қолданбасында үй тапсырмасын орында.', "Finish today's homework in «Уроки» first."),
    app_limit: t(`Лимит на эти приложения на сегодня исчерпан (${limitMin ?? 0} мин).`, `Бұл қолданбалардың бүгінгі лимиті бітті (${limitMin ?? 0} мин).`, `Today's limit for these apps is used up (${limitMin ?? 0} min).`),
    daily_limit: t(`Дневной лимит экранного времени исчерпан (${limitMin ?? 0} мин).`, `Экран уақытының бүгінгі лимиті бітті (${limitMin ?? 0} мин).`, `Today's screen time limit is used up (${limitMin ?? 0} min).`),
  }[reason];
  return { title: t('Сейчас нельзя', 'Қазір болмайды', 'Not now'), subtitle, button: t('Понятно', 'Түсінікті', 'OK') };
}

// ---------- native side ----------

type Lib = typeof import('react-native-device-activity');
type AppLock = { set(denyInstall: boolean, denyRemoval: boolean): void; clear(): void };

/** The build has the iOS screen-time extensions and entitlement (app.config.ts flag). */
export const iosScreenTimeOn = Platform.OS === 'ios' && Constants.expoConfig?.extra?.iosScreenTime === true;

let lib: Lib | null | undefined;
function rnda(): Lib | null {
  if (lib !== undefined) return lib;
  lib = null;
  if (!iosScreenTimeOn) return lib;
  try {
    // loaded only in flag-on builds: the module's views register native components at import time
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require('react-native-device-activity') as Lib;
    lib = m.isAvailable() ? m : null;
  } catch {
    lib = null;
  }
  return lib;
}
const appLock = () => (iosScreenTimeOn ? requireOptionalNativeModule<AppLock>('UrokiAppLock') : null);

/** The picker components (null outside flag-on iOS builds). */
export const iosPicker = () => rnda()?.DeviceActivitySelectionSheetViewPersisted ?? null;

const DENY_REMOVAL_KEY = 'uroki_deny_removal';
const SIG_PREFIX = 'uroki_sig_';

export type SelMeta = { apps: number; categories: number; sites: number };
export type IosStatus = { supported: boolean; authorized: boolean; denied: boolean; sel: Record<SelKey, SelMeta>; denyRemoval: boolean };

const EMPTY_META: SelMeta = { apps: 0, categories: 0, sites: 0 };
const isEmpty = (m: SelMeta) => m.apps + m.categories + m.sites === 0;

function selMeta(l: Lib, k: SelKey): SelMeta {
  try {
    const m = l.activitySelectionMetadata({ activitySelectionId: SEL[k] });
    return m ? { apps: m.applicationCount, categories: m.categoryCount, sites: m.webDomainCount } : EMPTY_META;
  } catch {
    return EMPTY_META;
  }
}

export function iosStatus(): IosStatus {
  const l = rnda();
  if (!l) return { supported: false, authorized: false, denied: false, sel: { always: EMPTY_META, limited: EMPTY_META, window: EMPTY_META }, denyRemoval: false };
  const auth = l.getAuthorizationStatus();
  return {
    supported: true,
    authorized: auth === l.AuthorizationStatus.approved,
    denied: auth === l.AuthorizationStatus.denied,
    sel: { always: selMeta(l, 'always'), limited: selMeta(l, 'limited'), window: selMeta(l, 'window') },
    denyRemoval: l.userDefaultsGet<boolean>(DENY_REMOVAL_KEY) === true,
  };
}

/** Screen Time permission for a child in Family Sharing (asks for the parent's Apple ID on the child's phone). */
export async function requestIosAuthorization(): Promise<boolean> {
  const l = rnda();
  if (!l) return false;
  try {
    await l.requestAuthorization('child');
  } catch {
    // cancelled, or the phone is not a child's phone in Family Sharing
  }
  return (await l.pollAuthorizationStatus({ maxAttempts: 10 })) === l.AuthorizationStatus.approved;
}

export function setIosDenyRemoval(on: boolean) {
  rnda()?.userDefaultsSet(DENY_REMOVAL_KEY, on);
}

// brand colours of the «Тетрадь» design (0..255)
const PAPER = { red: 250, green: 247, blue: 240 };
const INK = { red: 28, green: 32, blue: 46 };
const BRAND = { red: 42, green: 75, blue: 176 };
const WHITE = { red: 255, green: 255, blue: 255 };

function setShields(l: Lib, plan: Extract<IosPlan, { kind: 'on' }>, lang: string) {
  const reasons: IosReason[] = ['bedtime', 'school', 'homework', 'app_limit', 'daily_limit'];
  for (const reason of reasons) {
    const x = shieldText(reason, lang, plan.untils[reason], plan.limit?.minutes);
    l.updateShieldWithId(
      {
        title: x.title,
        subtitle: x.subtitle,
        primaryButtonLabel: x.button,
        iconSystemName: reason === 'bedtime' ? 'moon.fill' : reason === 'school' ? 'graduationcap.fill' : reason === 'homework' ? 'book.fill' : 'hourglass',
        backgroundColor: PAPER,
        titleColor: INK,
        subtitleColor: INK,
        primaryButtonBackgroundColor: BRAND,
        primaryButtonLabelColor: WHITE,
        iconTint: BRAND,
      },
      { primary: { behavior: 'close' } },
      reason,
    );
  }
}

function runNow(l: Lib, actions: PlanAction[], by: string) {
  for (const a of actions) {
    if (a.type === 'clearWhitelist') l.clearWhitelist();
    else if (a.type === 'addSelectionToWhitelist') l.addSelectionToWhitelistAndUpdateBlock(a.familyActivitySelection, by);
    else if (a.type === 'enableBlockAllMode') {
      l.useShieldWithId(a.shieldId);
      l.enableBlockAllMode(by);
    } else if (a.type === 'disableBlockAllMode') l.disableBlockAllMode(by);
    else if (a.type === 'resetBlocks') l.resetBlocks(by);
  }
}

/** Removes every shield, schedule and setting «Уроки» made (rules off, 402, or the parent switched it off). */
export function clearIos() {
  const l = rnda();
  if (!l) return;
  try {
    const ours = l.getActivities().filter((a) => a.startsWith(ACT_PREFIX));
    if (ours.length) l.stopMonitoring(ours);
    ours.forEach((a) => l.cleanUpAfterActivity(a));
    l.userDefaultsClearWithPrefix(SIG_PREFIX);
    l.disableBlockAllMode('uroki_off');
    l.clearWhitelist();
    l.resetBlocks('uroki_off');
    l.clearAllManagedSettingsStoreSettings();
  } catch {
    // nothing scheduled yet
  }
  appLock()?.clear();
}

/**
 * Applies a fresh GET /screen/rules response (or null after a 402) on this iPhone. Call it on every rules fetch
 * and app foreground. Returns false when Screen Time is not available or not authorized yet.
 */
export async function applyIos(s: ScreenState | null): Promise<boolean> {
  const l = rnda();
  if (!l) return false;
  const st = iosStatus();
  const plan = planIos(s, clockFor(s?.tz ?? 'Asia/Almaty'), { always: !isEmpty(st.sel.always), limited: !isEmpty(st.sel.limited), window: !isEmpty(st.sel.window) });
  if (plan.kind === 'off') {
    clearIos();
    return true;
  }
  if (!st.authorized) return false;
  setShields(l, plan, s?.lang ?? 'ru');

  const wanted = new Set(plan.activities.map((a) => a.name));
  const stale = l.getActivities().filter((a) => a.startsWith(ACT_PREFIX) && !wanted.has(a));
  if (stale.length) l.stopMonitoring(stale);
  for (const a of stale) {
    l.cleanUpAfterActivity(a);
    l.userDefaultsRemove(SIG_PREFIX + a);
  }

  const running = new Set(l.getActivities());
  for (const a of plan.activities) {
    // actions are plain data in the App Group: rewritten every time; monitoring restarts only on a real change
    l.configureActions({ activityName: a.name, callbackName: 'intervalDidStart', actions: a.start });
    l.configureActions({ activityName: a.name, callbackName: 'intervalDidEnd', actions: a.end });
    if (a.event) l.configureActions({ activityName: a.name, callbackName: 'eventDidReachThreshold', eventName: a.event.name, actions: a.event.actions });
    if (running.has(a.name) && l.userDefaultsGet<string>(SIG_PREFIX + a.name) === a.key) continue;
    try {
      const token = a.event ? l.getFamilyActivitySelectionId(SEL.limited) : undefined;
      const events =
        a.event && token
          ? [{ eventName: a.event.name, familyActivitySelection: token, threshold: { hour: Math.floor(a.event.minutes / 60), minute: a.event.minutes % 60 }, includesPastActivity: true }]
          : [];
      await l.startMonitoring(a.name, a.schedule, events);
      l.userDefaultsSet(SIG_PREFIX + a.name, a.key);
    } catch {
      // e.g. an interval Apple rejects; the immediate state below still applies
      l.userDefaultsRemove(SIG_PREFIX + a.name);
    }
  }

  // the state right now (the extensions only act on transitions)
  if (plan.unlocked) {
    runNow(l, [{ type: 'disableBlockAllMode' }, { type: 'resetBlocks' }], 'uroki_unlock');
  } else if (plan.now) {
    runNow(l, whitelistBlock(plan.now.reason, plan.now.sels, {}), 'uroki_now');
  } else {
    runNow(l, [{ type: 'disableBlockAllMode' }], 'uroki_now');
  }
  appLock()?.set(plan.denyInstall, st.denyRemoval);
  return true;
}
