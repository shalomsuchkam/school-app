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
};
export type Day = { date: string; label: string; total: number; done: number; last_done_hm: string | null; on_time: boolean; tasks: Task[] };
export type Overview = { now_hm: string; active: string; days: Day[]; streak: number; perfect_week: number; days_off: string[] };
export type Family = {
  id: string;
  child_name: string;
  tz: string;
  school_weekdays: number[];
  soft_deadline: string;
  hard_deadline: string;
  remind_times: string[];
};
export type Member = { id: string; role: Role; name: string | null; telegram: boolean; me: boolean };
export type Me = {
  device: { id: string; role: Role; name: string | null };
  family: Family;
  members: Member[];
  telegram: { enabled: boolean; bot: string | null; linked: boolean };
};
export type Subject = { id: number; name: string; emoji: string; light: boolean };
export type Item = { id: number; title: string; emoji: string; required: boolean; needs_photo: boolean; weekdays: number[] | null; pos: number };
export type Setup = { subjects: Subject[]; lessons: Record<string, number[]>; items: Item[]; days_off: string[] };
export type ParentAction = 'ok' | 'done' | 'redo' | 'skip_ok' | 'skip_no' | 'reset';

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

let token: string | null = null;
export const setToken = (t: string | null) => {
  token = t;
};

async function call<T>(method: string, path: string, body?: unknown, form?: FormData): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  let r: Response;
  try {
    r = await fetch(API_BASE + path, { method, headers, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  } catch {
    throw new ApiError('Нет связи с сервером', 0);
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(data.error || 'Ошибка сервера', r.status);
  return data as T;
}

type Auth = { token: string; role: Role };
export const api = {
  createFamily: (child_name: string, parent_name: string) => call<Auth>('POST', '/family', { child_name, parent_name }),
  join: (code: string, name: string) => call<Auth>('POST', '/join', { code, name }),
  me: () => call<Me>('GET', '/me'),
  setup: () => call<Setup>('GET', '/setup'),
  updateFamily: (patch: Partial<Family>) => call<Family>('PUT', '/family', patch),

  childState: () => call<ChildState>('GET', '/child/state'),
  skip: (task_id: number, reason: string) => call('POST', '/child/skip', { task_id, reason }),
  check: (task_id: number, done: boolean) => call('POST', '/child/check', { task_id, done }),
  photo: (task_id: number, uri: string) => {
    const fd = new FormData();
    fd.append('task_id', String(task_id));
    fd.append('file', { uri, name: 'photo.jpg', type: 'image/jpeg' } as unknown as Blob);
    return call('POST', '/child/photo', undefined, fd);
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

export const isDone = (t: Task) => t.status === 'done' || t.status === 'skip_ok';
