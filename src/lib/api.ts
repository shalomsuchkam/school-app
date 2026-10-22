import Constants from 'expo-constants';
import { File as FsFile } from 'expo-file-system';
import { Platform } from 'react-native';

import { getLang, t } from './i18n';

// Client for the `app` edge function (multi-family backend of the mobile app).
// EXPO_PUBLIC_API_URL (build secret) points builds at the self-hosted server in Kazakhstan once it runs.
export const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://cmranrfjvvmhktntbnpg.supabase.co/functions/v1/app';

export type Role = 'parent' | 'child' | 'viewer';
// Who may be invited (and the role a session holds).
export type Category = 'school' | 'home';
export type TaskStatus = 'todo' | 'done' | 'redo' | 'skip_pending' | 'skip_ok' | 'skip_no';
export type Photo = { id: number; url: string | null; at: string; page: number; hm: string | null };
export type Task = {
  id: number;
  kind: 'lesson' | 'item';
  label: string;
  emoji: string;
  light: boolean;
  needs_photo: boolean;
  required: boolean;
  status: TaskStatus;
  skip_reason: string | null;
  accepted: boolean;
  done_at: string | null;
  done_hm: string | null;
  // what was assigned (typed by the child or a parent) and the parent's comment on the photos
  note: string | null;
  parent_comment: string | null;
  photos: Photo[];
  // home chores vs school (lessons are always school); estimate in minutes or null
  category?: Category;
  duration_min?: number | null;
  // chat messages on this task, and a signed link (900 s) to the child's voice note
  messages?: number;
  voice_url?: string | null;
};
export type ChildState = {
  name: string;
  child_id: number;
  school_date: string;
  school_label: string;
  due_date: string;
  due_label: string;
  due_today: boolean;
  soft: string;
  hard: string;
  remind_times: string[];
  now_hm: string;
  mins_to_soft: number | null;
  mins_to_hard: number | null;
  streak: number;
  perfect_week: number;
  tasks: Task[];
  tz: string;
  // Further due days after due_date (ascending), used for offline reminders.
  upcoming: { due_date: string; school_date: string }[];
  reward: { goal: number; text: string } | null;
  track_time: boolean;
  started_at: string | null;
  // note of a one-day override for school_date
  override_note?: string | null;
};
export type Day = { date: string; label: string; total: number; done: number; last_done_hm: string | null; on_time: boolean; tasks: Task[]; override_note?: string | null };
export type Overview = {
  child_id: number;
  child_name: string;
  now_hm: string;
  active: string;
  days: Day[];
  streak: number;
  perfect_week: number;
  days_off: string[];
  // most recent API call of this child's devices
  child_seen?: string | null;
};
export type Family = {
  id: string;
  code: string;
  child_name: string;
  photo_retention_days: number;
  country: string;
  lang: 'ru' | 'kk' | 'en';
  reward_goal: number | null;
  reward_text: string | null;
  track_time: boolean;
  auto_holidays: boolean;
  tz: string;
  school_weekdays: number[];
  soft_deadline: string;
  hard_deadline: string;
  remind_times: string[];
  // quiet hours (HH:MM, may cross midnight; both null = off) and read-only tutors / teachers
  quiet_from?: string | null;
  quiet_to?: string | null;
  allow_viewers?: boolean;
};
export type Member = { id: string; role: Role; name: string | null; telegram: boolean; me: boolean; child_id: number | null; last_seen?: string | null };
export type Child = { id: number; name: string; pos: number };
export type Access = {
  active: boolean;
  billing: boolean;
  free_forever: boolean;
  paid_until: string | null;
  granted_until: string | null;
  trial: boolean;
  store: string | null;
};
export type Me = {
  device: { id: string; role: Role; name: string | null; child_id: number | null };
  family: Family;
  children: Child[];
  access: Access;
  members: Member[];
  telegram: { enabled: boolean; bot: string | null; linked: boolean };
};
export type Subject = { id: number; name: string; emoji: string; light: boolean };
// child_id null = for every child in the family
export type Item = {
  id: number;
  title: string;
  emoji: string;
  required: boolean;
  needs_photo: boolean;
  weekdays: number[] | null;
  pos: number;
  child_id?: number | null;
  category?: Category;
  duration_min?: number | null;
};
// One day's lessons replacing the timetable (empty subject_ids = no lessons that day).
export type Override = { date: string; subject_ids: number[]; note: string | null };
export type Setup = {
  child_id: number;
  subjects: Subject[];
  lessons: Record<string, number[]>;
  // optional alternating timetable: "1" = odd ISO weeks, "2" = even ISO weeks
  lessons_alt: Record<'1' | '2', Record<string, number[]>>;
  items: Item[];
  days_off: string[];
  holidays: string[];
  // this child's overrides from today to today + 30 days, by date
  overrides?: Override[];
};
export type CalendarStatus = 'done_on_time' | 'done_late' | 'partial' | 'missed' | 'off' | 'future' | 'empty';
export type CalendarDay = { date: string; status: CalendarStatus; total: number; done: number };
export type Calendar = { month: string; child_id: number; days: CalendarDay[] };
export type Message = { id: number; role: 'parent' | 'child'; name: string | null; body: string; created_at: string; mine: boolean };
export type Invite = { code: string; role: Role; expires_at: string; url: string | null };
export type Report = {
  child_id: number;
  child_name: string;
  from: string;
  to: string;
  days: { date: string; total: number; on_time: number; late: number; skipped: number; missed: number; minutes: number | null }[];
  subjects: { title: string; emoji: string; total: number; onTime: number; late: number; skipped: number; missed: number }[];
  totals: { total: number; on_time: number; late: number; skipped: number; missed: number };
  streak: number;
  perfect_week: number;
};
export type ParentAction = 'ok' | 'done' | 'redo' | 'skip_ok' | 'skip_no' | 'reset' | 'undo' | 'comment';

// Screen time (docs/SCREEN_TIME.md). Package names are Android package names; times are HH:MM in the family tz.
export type AppLimit = { pkg: string; name: string; minutes: number };
export type ScreenWindow = { from: string; to: string; allowed: string[] };
export type SchoolWindow = ScreenWindow & { days: number[] };
export type ScreenRules = {
  child_id: number;
  enabled: boolean;
  daily_limit_min: number | null;
  app_limits: AppLimit[];
  blocked_apps: string[];
  always_allowed: string[];
  bedtime: ScreenWindow | null;
  school: SchoolWindow | null;
  homework_lock: boolean;
  homework_lock_from: string;
  block_new_apps: boolean;
  // read-only here: set through screenUnlock
  unlock_until: string | null;
  updated_at: string | null;
};
export type ReportedApp = { pkg: string; name: string; installed_at?: string | number };
export type GuardReport = { usage_access: boolean; overlay: boolean; battery_ok: boolean; running: boolean };
export type DeviceReport = {
  device_id: string;
  apps: ReportedApp[];
  usage: { date?: string; total_min?: number; apps?: Record<string, number> };
  guard: Partial<GuardReport>;
  reported_at: string | null;
  approved: string[];
};
export type Textbook = { id: number; child_id: number | null; title: string; url: string; created_at: string };
export type ScreenState = {
  rules: ScreenRules;
  homework_done: boolean;
  homework_date: string;
  homework_due_today: boolean;
  tz: string;
  textbooks: Textbook[];
  device: DeviceReport | null;
  today: string;
  school_day: boolean;
  approved: string[];
  new_apps: string[];
  lang: 'ru' | 'kk' | 'en';
};
export type ScreenPatch = Partial<Omit<ScreenRules, 'child_id' | 'unlock_until' | 'updated_at'>> & { child_id: number };

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

// Build number baked in at build time (android.versionCode / ios.buildNumber via app.config.js).
const appBuild = () => Number(Platform.OS === 'ios' ? Constants.expoConfig?.ios?.buildNumber : Constants.expoConfig?.android?.versionCode) || 0;
let onTooOld: (() => void) | null = null;
export const setTooOldHandler = (f: (() => void) | null) => {
  onTooOld = f;
};

let token: string | null = null;
export const setToken = (t: string | null) => {
  token = t;
};
// The signed-in device's token (the child's screen guard polls the server with it).
export const getToken = () => token;

type Raw = { data: Uint8Array<ArrayBuffer> | Blob; type: string };
async function call<T>(method: string, path: string, body?: unknown, raw?: Raw): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  headers['x-lang'] = getLang(); // server messages in the user's language
  if (raw) headers['content-type'] = raw.type;
  else if (body !== undefined) headers['content-type'] = 'application/json';
  let r: Response;
  try {
    r = await fetch(API_BASE + path, { method, headers, body: raw ? raw.data : body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(t('common.offline'), 0);
  }
  const min = Number(r.headers.get('x-min-build') ?? 0);
  if (min && min > appBuild()) onTooOld?.();
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(data.error || t('common.serverError'), r.status);
  return data as T;
}

type Auth = { token: string; role: Role };
export const api = {
  createFamily: (f: { child_name: string; parent_name: string; tz?: string; country: string; lang: string; consent: true }) => call<Auth>('POST', '/family', f),
  deleteFamily: () => call('DELETE', '/family'),
  billingRefresh: () => call<Access>('POST', '/billing/refresh', {}),
  join: (code: string, name: string) => call<Auth>('POST', '/join', { code, name }),
  me: () => call<Me>('GET', '/me'),
  // child: which child's timetable (parents with several children); default = first child
  setup: (child?: number) => call<Setup>('GET', `/setup${child ? `?child=${child}` : ''}`),
  updateFamily: (patch: Partial<Family>) => call<Family>('PUT', '/family', patch),

  childState: () => call<ChildState>('GET', '/child/state'),
  skip: (task_id: number, reason: string) => call('POST', '/child/skip', { task_id, reason }),
  check: (task_id: number, done: boolean) => call('POST', '/child/check', { task_id, done }),
  childNote: (task_id: number, note: string) => call('POST', '/child/note', { task_id, note }),
  startSession: () => call<{ started_at: string | null }>('POST', '/child/start', {}),
  // Raw JPEG body: expo/fetch (the global fetch in SDK 57) can't send RN's {uri} FormData parts.
  photo: async (task_id: number, uri: string) => {
    let data: Raw['data'];
    try {
      data = Platform.OS === 'web' ? await (await fetch(uri)).blob() : await new FsFile(uri).bytes();
    } catch {
      throw new ApiError(t('common.photoRead'), 0);
    }
    return call('POST', `/child/photo?task_id=${task_id}`, undefined, { data, type: 'image/jpeg' });
  },

  // Raw audio body (AAC in MP4, .m4a); the server checks the bytes and caps it at 2 MB.
  voice: async (task_id: number, uri: string) => {
    let data: Raw['data'];
    try {
      data = Platform.OS === 'web' ? await (await fetch(uri)).blob() : await new FsFile(uri).bytes();
    } catch {
      throw new ApiError(t('child.voice.readFail'), 0);
    }
    return call<{ ok: true }>('POST', `/child/voice?task_id=${task_id}`, undefined, { data, type: 'audio/mp4' });
  },
  messages: (task_id: number) => call<Message[]>('GET', `/tasks/${task_id}/messages`),
  sendMessage: (task_id: number, body: string) => call<Message>('POST', `/tasks/${task_id}/messages`, { body }),

  overview: (child?: number) => call<Overview>('GET', `/parent/overview${child ? `?child=${child}` : ''}`),
  action: (id: number, action: ParentAction, comment?: string) => call<{ text: string }>('POST', '/parent/task', { id, action, comment }),
  parentNote: (task_id: number, note: string) => call('POST', '/parent/note', { task_id, note }),
  // days: period length ending today (server accepts 7..31; default = the current week)
  report: (child?: number, days?: number) => {
    const q = [child ? `child=${child}` : '', days ? `days=${Math.min(31, Math.max(7, Math.round(days)))}` : ''].filter(Boolean).join('&');
    return call<Report>('GET', `/parent/report${q ? `?${q}` : ''}`);
  },
  addChild: (name: string) => call<Child>('POST', '/children', { name }),
  renameChild: (id: number, name: string) => call('PATCH', `/children/${id}`, { name }),
  removeChild: (id: number) => call('DELETE', `/children/${id}`),
  calendar: (month?: string, child?: number) => {
    const q = [month ? `month=${month}` : '', child ? `child=${child}` : ''].filter(Boolean).join('&');
    return call<Calendar>('GET', `/parent/calendar${q ? `?${q}` : ''}`);
  },
  setOverride: (date: string, o: { child_id?: number; subject_ids: number[]; note?: string | null }) => call<Override & { child_id: number }>('PUT', `/overrides/${date}`, o),
  deleteOverride: (date: string, child?: number) => call<{ ok: true }>('DELETE', `/overrides/${date}${child ? `?child=${child}` : ''}`),
  nudge: (child?: number) => call<{ sent: number; left: number }>('POST', `/parent/nudge${child ? `?child=${child}` : ''}`, {}),

  addSubject: (s: Omit<Subject, 'id'>) => call<Subject>('POST', '/subjects', s),
  updateSubject: (id: number, s: Partial<Subject>) => call('PATCH', `/subjects/${id}`, s),
  deleteSubject: (id: number) => call('DELETE', `/subjects/${id}`),
  setLessons: (weekday: number, subject_ids: number[], week_parity: 0 | 1 | 2 = 0, child_id?: number) =>
    call('PUT', `/lessons/${weekday}`, { subject_ids, week_parity, child_id }),

  addItem: (i: Omit<Item, 'id' | 'pos'> & { pos?: number }) => call<Item>('POST', '/items', i),
  updateItem: (id: number, i: Partial<Item>) => call('PATCH', `/items/${id}`, i),
  deleteItem: (id: number) => call('DELETE', `/items/${id}`),

  dayOff: (date: string, off: boolean) => call('POST', '/dayoff', { date, off }),
  invite: (role: Role, child_id?: number) => call<Invite>('POST', '/invite', { role, child_id }),
  removeMember: (id: string) => call('DELETE', `/members/${id}`),
  leave: () => call('DELETE', '/members/me'),
  telegramLink: () => call<{ url: string }>('POST', '/telegram/link', {}),
  telegramUnlink: () => call('DELETE', '/telegram'),
  pushToken: (t: string) => call('POST', '/push', { token: t }),

  // Screen time: a child device always gets its own rules (child is ignored there).
  getScreenRules: (child?: number) => call<ScreenState>('GET', `/screen/rules${child ? `?child=${child}` : ''}`),
  putScreenRules: (patch: ScreenPatch) => call<ScreenRules>('PUT', '/screen/rules', patch),
  // minutes 1..240 opens the phone for that long; 0 cancels
  screenUnlock: (child_id: number, minutes: number) => call<ScreenRules>('POST', '/screen/unlock', { child_id, minutes }),
  screenApprove: (child_id: number, pkg: string, action: 'allow' | 'block' | 'limit', minutes?: number) =>
    call<ScreenRules>('POST', '/screen/approve', { child_id, pkg, action, ...(action === 'limit' ? { minutes } : null) }),

  // Textbook links (child_id null = every child); a parent without `child` gets all of the family's links.
  textbooks: (child?: number) => call<Textbook[]>('GET', `/textbooks${child ? `?child=${child}` : ''}`),
  addTextbook: (b: { child_id: number | null; title: string; url: string }) => call<Textbook>('POST', '/textbooks', b),
  deleteTextbook: (id: number) => call<{ ok: true }>('DELETE', `/textbooks/${id}`),
};

// Public legal pages served by the backend.
export const legalUrl = (kind: 'terms' | 'privacy', lang = 'ru') => `${API_BASE}/legal/${kind}?lang=${lang === 'en' || lang === 'kk' ? lang : 'ru'}`;
// 402 = the family's subscription is not active.
export const isPaywall = (e: unknown) => e instanceof ApiError && e.status === 402;

// A read-only tutor / teacher device.
export const isViewer = (r: Role | null | undefined) => r === 'viewer';

export const isDone = (t: Task) => t.status === 'done' || t.status === 'skip_ok';
