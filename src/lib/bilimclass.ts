// Explicit text import and pure subject/date matching helpers.
// No portal access, credentials, cookies or session inspection.

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

// ---------- calendar helpers ----------
/** Monday of the week of `d` as DD.MM.YYYY (the diary's `date` parameter). */
export function mondayOf(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return `${pad(x.getDate())}.${pad(x.getMonth() + 1)}.${x.getFullYear()}`;
}
/** School year that contains `d` (Sept–Aug), as BilimClass's `eduYear`. */
export const eduYearOf = (d: Date) => (d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1);

