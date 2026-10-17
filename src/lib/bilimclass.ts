// BilimClass import (beta), privacy-first:
//  · the parent signs in on the real bilimclass.kz page inside a WebView; we never see the login or password;
//  · a script injected into that page uses the page's own session to read this and next week's diary and posts
//    only the diary JSON back to the app (never the token);
//  · nothing from BilimClass is sent to our server except the homework text the parent confirms, as task notes.
// Endpoints follow the public community docs of the web app's API (api.bilimclass.kz, v4 client office).
// Every parser here is defensive: unknown shapes yield an empty list, never a crash.

export type BcItem = { date: string; subject: string; homework: string };
export type SubjectLike = { id: number; name: string };

const pad = (n: number) => String(n).padStart(2, '0');

/** Text of a homework body: HTML stripped, entities decoded, whitespace squeezed. */
export function cleanText(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

/** 'YYYY-MM-DD' from "21.10.2026", "2026-10-21…" or a Unix timestamp (s or ms), in the family time zone. */
export function toIsoDate(v: unknown, tz = 'Asia/Almaty'): string | null {
  if (typeof v === 'string') {
    const s = v.trim();
    let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    if (/^\d{9,13}$/.test(s)) return toIsoDate(Number(s), tz);
    return null;
  }
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
    const ms = v < 1e12 ? v * 1000 : v;
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
    } catch {
      return new Date(ms).toISOString().slice(0, 10);
    }
  }
  return null;
}

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (...vals: unknown[]) => {
  for (const v of vals) if (typeof v === 'string' && v.trim()) return v.trim();
  return '';
};

function push(out: BcItem[], date: string | null, subject: string, hw: unknown) {
  const homework = cleanText(hw);
  if (!date || !subject || !homework) return;
  // the same lesson can appear twice (diary + schedule): keep one
  if (out.some((x) => x.date === date && x.subject === subject && x.homework === homework)) return;
  out.push({ date, subject, homework });
}

/**
 * Homework items from any of the known responses:
 *  · /api/v4/os/clientoffice/diary      → data.days[].{date, subjects[].{label, homeworkBody}}
 *  · /api/v4/os/clientoffice/schedule   → data.days[].{date|dateFormat, schedule[].{label, homeworkBody}}
 *  · /api/v4/os/clientoffice/homeworks/monthly/list → data[].homeworks[].{subjectName, date, body}
 * A list of such responses is accepted too.
 */
export function parseBilim(raw: unknown, tz?: string): BcItem[] {
  const out: BcItem[] = [];
  const visit = (r: unknown) => {
    if (Array.isArray(r)) return r.forEach(visit);
    const root = obj(r);
    if (!root) return;
    const data = root.data ?? root;
    // monthly homework list
    if (Array.isArray(data)) {
      for (const month of data) {
        for (const h of arr(obj(month)?.homeworks)) {
          const o = obj(h);
          if (o) push(out, toIsoDate(o.date, tz), str(o.subjectName, o.subject, o.label), o.body ?? o.homeworkBody);
        }
      }
      return;
    }
    const d = obj(data);
    for (const day of arr(d?.days)) {
      const o = obj(day);
      if (!o) continue;
      const date = toIsoDate(o.date, tz) ?? toIsoDate(o.dateFormat, tz) ?? toIsoDate(o.day, tz);
      for (const s of [...arr(o.subjects), ...arr(o.schedule), ...arr(o.lessons)]) {
        const l = obj(s);
        if (l) push(out, toIsoDate(l.date, tz) ?? date, str(l.label, l.subjectName, l.subject, l.name), l.homeworkBody ?? l.homework ?? l.body);
      }
    }
  };
  try {
    visit(raw);
  } catch {
    return [];
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- subject matching ----------
export const normName = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'().,:;!?№#/\\[\]{}_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function lev(a: string, b: string) {
  if (a === b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

/** 0..1 likeness of two subject names (exact, containment, shared words, edit distance). */
export function similarity(a: string, b: string) {
  const x = normName(a);
  const y = normName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.9;
  const tx = new Set(x.split(' '));
  const ty = new Set(y.split(' '));
  const common = [...tx].filter((w) => w.length > 2 && ty.has(w)).length;
  const words = common ? (0.6 * common) / Math.max(tx.size, ty.size) + 0.3 : 0;
  const edit = 1 - lev(x, y) / Math.max(x.length, y.length);
  return Math.max(words, edit);
}

export type Mapping = Record<string, number>; // normName(BilimClass subject) → family subject id

/** The family subject for a BilimClass name: a remembered choice first, then the best fuzzy match (≥ 0.7). */
export function matchSubject(name: string, subjects: SubjectLike[], saved: Mapping = {}): number | null {
  const key = normName(name);
  const s = saved[key];
  if (s !== undefined && subjects.some((x) => x.id === s)) return s;
  let best: { id: number; score: number } | null = null;
  for (const x of subjects) {
    const score = similarity(name, x.name);
    if (!best || score > best.score) best = { id: x.id, score };
  }
  return best && best.score >= 0.7 ? best.id : null;
}

export type Plan = { item: BcItem; subjectId: number | null; taskId: number | null };
export type TaskLike = { id: number; kind: string; label: string };

/**
 * What to write: each item of `date` with its mapped subject and that subject's lesson task on the day.
 * Several items for one subject are merged into one note (in diary order).
 */
export function planImport(items: BcItem[], date: string, subjects: SubjectLike[], tasks: TaskLike[], saved: Mapping = {}): Plan[] {
  const byName = new Map(subjects.map((s) => [s.id, normName(s.name)]));
  const merged: BcItem[] = [];
  for (const it of items.filter((x) => x.date === date)) {
    const same = merged.find((m) => normName(m.subject) === normName(it.subject));
    if (same) same.homework = `${same.homework}\n${it.homework}`;
    else merged.push({ ...it });
  }
  return merged.map((item) => {
    const subjectId = matchSubject(item.subject, subjects, saved);
    const name = subjectId !== null ? byName.get(subjectId) : null;
    const task = name ? tasks.find((t) => t.kind === 'lesson' && normName(t.label) === name) : undefined;
    return { item, subjectId, taskId: task?.id ?? null };
  });
}

// ---------- pasted text ----------
// letters of ru / kk / en without Unicode property escapes (not every JS engine on phones has them)
const L = 'A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі';
const SUBJECT_LINE = new RegExp(`^([${L}][${L}\\d .()-]{1,38}?)\\s*(?::|—|–|\\s-\\s)\\s*(.+)$`);
/**
 * "Математика: стр. 42, № 5" lines → items (subject before ':' / '—' / ' - '); lines without a subject continue the
 * previous item. Without any subject line the whole text is one item with an empty subject (assign it by hand).
 */
export function parsePasted(text: string): { subject: string; homework: string }[] {
  const out: { subject: string; homework: string }[] = [];
  for (const line of cleanText(text).split('\n')) {
    const l = line.trim();
    if (!l) continue;
    const m = l.match(SUBJECT_LINE);
    if (m) out.push({ subject: m[1].trim(), homework: m[2].trim() });
    else if (out.length) out[out.length - 1].homework += `\n${l}`;
    else out.push({ subject: '', homework: l });
  }
  return out;
}

// ---------- the script injected into bilimclass.kz ----------
/** Monday of the week of `d` as DD.MM.YYYY (the diary's `date` parameter). */
export function mondayOf(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return `${pad(x.getDate())}.${pad(x.getMonth() + 1)}.${x.getFullYear()}`;
}
/** School year that contains `d` (Sept–Aug), as BilimClass's `eduYear`. */
export const eduYearOf = (d: Date) => (d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1);

/**
 * Runs inside the BilimClass page. It finds the page's own access token and profile in its storage, reads the diary
 * for this and next week (falling back to the monthly homework list) and posts
 * `{ type: 'diary', payloads }`, `{ type: 'need_login' }` or `{ type: 'error', message }`. The token never leaves the page.
 */
export const READ_DIARY_JS = String.raw`(function () {
  var RN = window.ReactNativeWebView;
  function post(o) { try { RN && RN.postMessage(JSON.stringify(o)); } catch (e) {} }
  var JWT = /^(Bearer\s+)?(eyJ[\w-]+\.[\w-]+\.[\w-]+)$/;
  function parse(v) { try { return JSON.parse(v); } catch (e) { return v; } }
  function walk(v, depth, fn) {
    if (depth > 6 || v == null) return;
    if (typeof v === 'string') { var p = v.length > 1 && (v[0] === '{' || v[0] === '[') ? parse(v) : v; if (p !== v) walk(p, depth + 1, fn); else fn(null, v); return; }
    if (typeof v !== 'object') return;
    for (var k in v) { if (!Object.prototype.hasOwnProperty.call(v, k)) continue; fn(k, v[k], v); walk(v[k], depth + 1, fn); }
  }
  function stores() {
    var out = [];
    [window.localStorage, window.sessionStorage].forEach(function (s) {
      try { for (var i = 0; i < s.length; i++) { var k = s.key(i); out.push([k, s.getItem(k)]); } } catch (e) {}
    });
    try { document.cookie.split(';').forEach(function (c) { var i = c.indexOf('='); if (i > 0) out.push([c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1))]); }); } catch (e) {}
    return out;
  }
  var token = null, info = {};
  stores().forEach(function (kv) {
    var m = typeof kv[1] === 'string' && kv[1].match(JWT);
    if (m && !token && /token|auth|access/i.test(kv[0])) token = m[2];
    walk(parse(kv[1]), 0, function (k, v, parent) {
      if (typeof v === 'string') { var j = v.match(JWT); if (j && !token && (!k || /access|token/i.test(k)) && !/refresh|chat/i.test(k || '')) token = j[2]; }
      if (k === 'school_id' || k === 'schoolId') info.schoolId = info.schoolId || v;
      if (k === 'group' && v && typeof v === 'object' && v.id) info.groupId = info.groupId || v.id;
      if (k === 'groupId' && typeof v !== 'object') info.groupId = info.groupId || v;
      if (k === 'studentGroupUuid' && typeof v === 'string') info.groupUuid = info.groupUuid || v;
      if (k === 'studentGroupUuids' && v && v.length) info.groupUuid = info.groupUuid || v[0];
      if (k === 'isCurrent' && v === true && parent && parent.eduYear) info.eduYear = parent.eduYear;
    });
  });
  if (!token) { post({ type: 'need_login' }); return; }
  try { var payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); info.schoolId = info.schoolId || payload.school_id || payload.schoolId; } catch (e) {}
  var now = new Date();
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function monday(d) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
  function fmt(d) { return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear(); }
  var eduYear = info.eduYear || (now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1);
  var headers = { Accept: 'application/json', Authorization: 'Bearer ' + token, 'x-localization': 'ru' };
  if (info.schoolId) headers['x-school-id'] = String(info.schoolId);
  var API = 'https://api.bilimclass.kz';
  function get(path, q) {
    var qs = Object.keys(q).filter(function (k) { return q[k] != null && q[k] !== ''; }).map(function (k) { return k + '=' + encodeURIComponent(q[k]); }).join('&');
    return fetch(API + path + (qs ? '?' + qs : ''), { headers: headers, credentials: 'omit' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }
  var thisWeek = monday(now), nextWeek = new Date(thisWeek.getTime()); nextWeek.setDate(nextWeek.getDate() + 7);
  var base = { schoolId: info.schoolId, eduYear: eduYear };
  var groupReady = info.groupId ? Promise.resolve() : get('/api/v4/os/clientoffice/group-list', base).then(function (g) {
    walk(g, 0, function (k, v, parent) { if (!info.groupId && k === 'id' && parent && (parent.isMain || parent.main || parent.name)) info.groupId = v; if (!info.groupUuid && k === 'uuid' && parent && parent.name) info.groupUuid = v; });
  }).catch(function () {});
  groupReady.then(function () {
    return Promise.all([thisWeek, nextWeek].map(function (d) {
      return get('/api/v4/os/clientoffice/diary', { schoolId: base.schoolId, eduYear: eduYear, date: fmt(d), groupId: info.groupId }).catch(function () { return null; });
    }));
  }).then(function (weeks) {
    var got = weeks.filter(Boolean);
    if (got.length) return got;
    if (!info.groupUuid) return [];
    return get('/api/v4/os/clientoffice/homeworks/monthly/list', { schoolId: base.schoolId, eduYear: eduYear, studentGroupUuid: info.groupUuid }).then(function (h) { return [h]; }).catch(function () { return []; });
  }).then(function (payloads) {
    if (!payloads.length) post({ type: 'error', message: 'no diary' });
    else post({ type: 'diary', payloads: payloads });
  }).catch(function (e) { post({ type: 'error', message: String(e && e.message || e) }); });
})();
true;`;

export const BILIM_URL = 'https://bilimclass.kz/';

/** A message from the WebView, validated (anything else is ignored). */
export function readMessage(data: string): { type: 'diary'; payloads: unknown[] } | { type: 'need_login' } | { type: 'error'; message: string } | null {
  try {
    const m = JSON.parse(data) as { type?: string; payloads?: unknown; message?: unknown };
    if (m?.type === 'diary' && Array.isArray(m.payloads)) return { type: 'diary', payloads: m.payloads };
    if (m?.type === 'need_login') return { type: 'need_login' };
    if (m?.type === 'error') return { type: 'error', message: typeof m.message === 'string' ? m.message : '' };
  } catch {}
  return null;
}
