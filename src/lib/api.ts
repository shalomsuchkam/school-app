import { File as FsFile } from 'expo-file-system';
import { Platform } from 'react-native';

import { getLang, t } from './i18n';

// Client for the `app` edge function (multi-family backend of the mobile app).
export const API_BASE = 'https://cmranrfjvvmhktntbnpg.supabase.co/functions/v1/app';

export type Role = 'parent' | 'child';
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
  photos: Photo[];
};
export type ChildState = {
  name: string;
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
};
export type Day = { date: string; label: string; total: number; done: number; last_done_hm: string | null; on_time: boolean; tasks: Task[] };
export type Overview = { now_hm: string; active: string; days: Day[]; streak: number; perfect_week: number; days_off: string[] };
export type Family = {
  id: string;
  code: string;
  child_name: string;
  photo_retention_days: number;
  country: string;
  lang: 'ru' | 'kk' | 'en';
  tz: string;
  school_weekdays: number[];
  soft_deadline: string;
  hard_deadline: string;
  remind_times: string[];
};
export type Member = { id: string; role: Role; name: string | null; telegram: boolean; me: boolean };
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
  device: { id: string; role: Role; name: string | null };
  family: Family;
  access: Access;
  members: Member[];
  telegram: { enabled: boolean; bot: string | null; linked: boolean };
};
export type Subject = { id: number; name: string; emoji: string; light: boolean };
export type Item = { id: number; title: string; emoji: string; required: boolean; needs_photo: boolean; weekdays: number[] | null; pos: number };
export type Setup = { subjects: Subject[]; lessons: Record<string, number[]>; items: Item[]; days_off: string[] };
export type ParentAction = 'ok' | 'done' | 'redo' | 'skip_ok' | 'skip_no' | 'reset' | 'undo';

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

let token: string | null = null;
export const setToken = (t: string | null) => {
  token = t;
};

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
  setup: () => call<Setup>('GET', '/setup'),
  updateFamily: (patch: Partial<Family>) => call<Family>('PUT', '/family', patch),

  childState: () => call<ChildState>('GET', '/child/state'),
  skip: (task_id: number, reason: string) => call('POST', '/child/skip', { task_id, reason }),
  check: (task_id: number, done: boolean) => call('POST', '/child/check', { task_id, done }),
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

  overview: () => call<Overview>('GET', '/parent/overview'),
  action: (id: number, action: ParentAction) => call<{ text: string }>('POST', '/parent/task', { id, action }),
  nudge: () => call<{ sent: number; left: number }>('POST', '/parent/nudge', {}),

  addSubject: (s: Omit<Subject, 'id'>) => call<Subject>('POST', '/subjects', s),
  updateSubject: (id: number, s: Partial<Subject>) => call('PATCH', `/subjects/${id}`, s),
  deleteSubject: (id: number) => call('DELETE', `/subjects/${id}`),
  setLessons: (weekday: number, subject_ids: number[]) => call('PUT', `/lessons/${weekday}`, { subject_ids }),

  addItem: (i: Omit<Item, 'id' | 'pos'> & { pos?: number }) => call<Item>('POST', '/items', i),
  updateItem: (id: number, i: Partial<Item>) => call('PATCH', `/items/${id}`, i),
  deleteItem: (id: number) => call('DELETE', `/items/${id}`),

  dayOff: (date: string, off: boolean) => call('POST', '/dayoff', { date, off }),
  invite: (role: Role) => call<{ code: string; role: Role; expires_at: string }>('POST', '/invite', { role }),
  removeMember: (id: string) => call('DELETE', `/members/${id}`),
  leave: () => call('DELETE', '/members/me'),
  telegramLink: () => call<{ url: string }>('POST', '/telegram/link', {}),
  telegramUnlink: () => call('DELETE', '/telegram'),
  pushToken: (t: string) => call('POST', '/push', { token: t }),
};

// Public legal pages served by the backend.
export const legalUrl = (kind: 'terms' | 'privacy', lang = 'ru') => `${API_BASE}/legal/${kind}?lang=${lang === 'en' ? 'en' : 'ru'}`;
// 402 = the family's subscription is not active.
export const isPaywall = (e: unknown) => e instanceof ApiError && e.status === 402;

export const isDone = (t: Task) => t.status === 'done' || t.status === 'skip_ok';
