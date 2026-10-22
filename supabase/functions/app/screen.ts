// deno-lint-ignore-file no-explicit-any
// Screen time & textbooks (docs/SCREEN_TIME.md). The phone enforces the rules (modules/screen-guard); the server
// stores them, tells the guard whether today's homework is done, keeps the latest device report and spots new apps.
import { activeDay, children, ensureTasks, isDone, kidOf, loadTasks } from "./core.ts";
import { db, esc, HM, HttpError, inQuiet, json, limit, localParts } from "./lib.ts";
import { notifyChild, notifyParents } from "./notify.ts";

// ---------- types ----------
export type AppLimit = { pkg: string; name: string; minutes: number };
export type Window = { from: string; to: string; allowed: string[] };
export type SchoolWindow = Window & { days: number[] };
export type ScreenRules = {
  child_id: number;
  enabled: boolean;
  daily_limit_min: number | null;
  app_limits: AppLimit[];
  blocked_apps: string[];
  always_allowed: string[];
  bedtime: Window | null;
  school: SchoolWindow | null;
  homework_lock: boolean;
  homework_lock_from: string;
  block_new_apps: boolean;
  unlock_until: string | null;
  updated_at: string | null;
};
export type ScreenReason = "blocked" | "new_app" | "bedtime" | "school" | "homework" | "app_limit" | "daily_limit";
export type ScreenCtx = {
  pkg: string;
  nowLocalHM: string; // "HH:MM", family time zone
  isoWeekday: number; // 1..7 of today's family-local date
  isSchoolDay: boolean; // today (family-local) is a school day: school weekday, not a day off, not a public holiday (step 7)
  homeworkDone: boolean; // homework_done from the server
  homeworkDueToday: boolean; // the next school day's homework is due this evening (server: homework_due_today; step 8)
  usageApp: number; // minutes of this app today
  usageTotal: number; // minutes of all apps today, apps exempt by step 2 left out (see countedTotal)
  isNew: boolean; // installed after the rules were enabled (server: listed in new_apps)
  approved: boolean; // a parent approved it (server: not listed in new_apps)
  nowUtc: string | number | Date;
  setupOpen?: boolean; // the guard's own setup screen is open: com.android.settings is allowed
  isSystem?: boolean; // the device resolved this package as its home / dialer / SMS app
};

export const UROKI_PKG = "kz.uroki.app";
export const SETTINGS_PKG = "com.android.settings";
// Step 2, static part. The guard also exempts whatever the phone resolves as its default home, dialer and SMS app.
export const SYSTEM_PACKAGES: readonly string[] = [
  UROKI_PKG, "android", "com.android.systemui",
  // launchers
  "com.android.launcher", "com.android.launcher2", "com.android.launcher3", "com.google.android.apps.nexuslauncher",
  "com.sec.android.app.launcher", "com.miui.home", "com.mi.android.globallauncher", "com.huawei.android.launcher",
  "com.oppo.launcher", "com.bbk.launcher2",
  // phone, contacts
  "com.android.dialer", "com.google.android.dialer", "com.samsung.android.dialer", "com.android.phone", "com.android.server.telecom",
  "com.android.incallui", "com.samsung.android.incallui", "com.android.contacts", "com.google.android.contacts",
  "com.samsung.android.app.contacts",
  // SMS
  "com.android.mms", "com.google.android.apps.messaging", "com.samsung.android.messaging",
  // emergency
  "com.android.emergency", "com.google.android.apps.safetyhub", "com.android.cellbroadcastreceiver", "com.google.android.cellbroadcastreceiver",
];
const SYSTEM = new Set(SYSTEM_PACKAGES);

export const PKG = /^[A-Za-z0-9._]+$/;
export const validPkg = (s: unknown): s is string => typeof s === "string" && s.length >= 1 && s.length <= 200 && PKG.test(s);

export const DEFAULT_LOCK_FROM = "15:00";
export function defaultRules(childId: number): ScreenRules {
  return {
    child_id: childId, enabled: false, daily_limit_min: null, app_limits: [], blocked_apps: [], always_allowed: [], bedtime: null, school: null,
    homework_lock: false, homework_lock_from: DEFAULT_LOCK_FROM, block_new_apps: false, unlock_until: null, updated_at: null,
  };
}
const iso = (v: any) => (v ? new Date(v).toISOString() : null);
// A DB row (or nothing) -> the ScreenRules object clients see.
export function toRules(row: any, childId: number): ScreenRules {
  const r = defaultRules(childId);
  if (!row) return r;
  return {
    ...r,
    enabled: !!row.enabled,
    daily_limit_min: row.daily_limit_min ?? null,
    app_limits: Array.isArray(row.app_limits) ? row.app_limits : [],
    blocked_apps: row.blocked_apps ?? [],
    always_allowed: row.always_allowed ?? [],
    bedtime: row.bedtime ? { from: row.bedtime.from, to: row.bedtime.to, allowed: row.bedtime.allowed ?? [] } : null,
    school: row.school ? { from: row.school.from, to: row.school.to, days: row.school.days ?? [1, 2, 3, 4, 5], allowed: row.school.allowed ?? [] } : null,
    homework_lock: !!row.homework_lock,
    homework_lock_from: row.homework_lock_from ?? DEFAULT_LOCK_FROM,
    block_new_apps: !!row.block_new_apps,
    unlock_until: iso(row.unlock_until),
    updated_at: iso(row.updated_at),
  };
}

// ---------- the decision (docs/SCREEN_TIME.md "Decision order"; Kotlin mirrors this) ----------
// Step 2: never blocked.
export function isExempt(rules: Pick<ScreenRules, "always_allowed"> | null, pkg: string, setupOpen = false, isSystem = false) {
  return isSystem || SYSTEM.has(pkg) || (pkg === SETTINGS_PKG && setupOpen) || !!rules?.always_allowed?.includes(pkg);
}
// Today's total for step 10: every app except the step-2 ones.
export function countedTotal(rules: Pick<ScreenRules, "always_allowed"> | null, apps: Record<string, number>) {
  return Object.entries(apps).reduce((s, [pkg, m]) => (isExempt(rules, pkg) ? s : s + (Number(m) || 0)), 0);
}
// Windows are [from, to) in family time and may cross midnight; from === to is an empty window.
export const inWindow = (hm: string, w: { from: string; to: string } | null | undefined) => !!w && inQuiet(hm, w.from, w.to);

export function screenDecision(rules: ScreenRules | null, ctx: ScreenCtx): { allow: boolean; reason: ScreenReason | null } {
  const allow = { allow: true, reason: null };
  const block = (reason: ScreenReason) => ({ allow: false, reason });
  // 1
  if (!rules || !rules.enabled) return allow;
  // 2
  if (isExempt(rules, ctx.pkg, !!ctx.setupOpen, !!ctx.isSystem)) return allow;
  // 3
  if (rules.unlock_until && Date.parse(rules.unlock_until) > new Date(ctx.nowUtc).getTime()) return allow;
  // 4
  if (rules.blocked_apps.includes(ctx.pkg)) return block("blocked");
  // 5
  if (rules.block_new_apps && ctx.isNew && !ctx.approved) return block("new_app");
  // 6, 7: inside a window only its allowed apps run (and they run: steps 8-10 do not apply to them)
  if (inWindow(ctx.nowLocalHM, rules.bedtime)) return rules.bedtime!.allowed.includes(ctx.pkg) ? allow : block("bedtime");
  if (rules.school && ctx.isSchoolDay && rules.school.days.includes(ctx.isoWeekday) && inWindow(ctx.nowLocalHM, rules.school)) {
    return rules.school.allowed.includes(ctx.pkg) ? allow : block("school");
  }
  // 8
  if (rules.homework_lock && ctx.homeworkDueToday && !ctx.homeworkDone && ctx.nowLocalHM >= rules.homework_lock_from) return block("homework");
  // 9
  const lim = rules.app_limits.find((l) => l.pkg === ctx.pkg);
  if (lim && ctx.usageApp >= lim.minutes) return block("app_limit");
  // 10
  if (rules.daily_limit_min != null && ctx.usageTotal >= rules.daily_limit_min) return block("daily_limit");
  // 11
  return allow;
}

// ---------- validation ----------
const bad = (m = "Неверные правила") => new HttpError(400, m);
const minutes = (v: unknown, lo = 1, hi = 1440) => {
  if (!Number.isInteger(v) || (v as number) < lo || (v as number) > hi) throw bad(lo === 0 ? `Минуты: от 0 до ${hi}` : "Минуты: от 1 до 1440");
  return v as number;
};
const hm = (v: unknown) => {
  if (typeof v !== "string" || !HM.test(v)) throw bad("Время в формате ЧЧ:ММ");
  return v;
};
export function pkgList(v: unknown, max = 200): string[] {
  if (v == null) return [];
  if (!Array.isArray(v)) throw bad();
  if (v.length > max) throw bad("Не больше 200 приложений в списке");
  if (!v.every(validPkg)) throw bad("Неверное имя приложения");
  return [...new Set(v as string[])];
}
function window(v: any, school: boolean): any {
  if (v === null) return null;
  if (typeof v !== "object" || Array.isArray(v)) throw bad();
  const from = hm(v.from), to = hm(v.to);
  if (from === to) throw bad("Начало и конец совпадают");
  const w: any = { from, to, allowed: pkgList(v.allowed) };
  if (school) {
    const days = v.days === undefined ? [1, 2, 3, 4, 5] : v.days;
    if (!Array.isArray(days) || !days.length || !days.every((n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 7)) {
      throw bad("День недели 1–7");
    }
    w.days = [...new Set<number>(days)].sort();
  }
  return w;
}
// PUT /screen/rules body -> a column patch. Fields that are left out stay as they are; child_id, unlock_until and
// updated_at are ignored (unlock has its own endpoint, so an echoed old value can never revive a finished unlock).
export function parseRulesPatch(b: any): Record<string, any> {
  if (!b || typeof b !== "object" || Array.isArray(b)) throw bad();
  const p: Record<string, any> = {};
  for (const k of ["enabled", "homework_lock", "block_new_apps"]) {
    if (b[k] === undefined) continue;
    if (typeof b[k] !== "boolean") throw bad();
    p[k] = b[k];
  }
  if (b.daily_limit_min !== undefined) p.daily_limit_min = b.daily_limit_min === null ? null : minutes(b.daily_limit_min);
  if (b.app_limits !== undefined) {
    const v = b.app_limits ?? [];
    if (!Array.isArray(v)) throw bad();
    if (v.length > 100) throw bad("Не больше 100 ограничений по приложениям");
    const byPkg = new Map<string, AppLimit>();
    for (const x of v) {
      if (!x || typeof x !== "object") throw bad();
      if (!validPkg(x.pkg)) throw bad("Неверное имя приложения");
      byPkg.set(x.pkg, { pkg: x.pkg, name: String(x.name ?? "").trim().slice(0, 80) || x.pkg, minutes: minutes(x.minutes) });
    }
    p.app_limits = [...byPkg.values()];
  }
  if (b.blocked_apps !== undefined) p.blocked_apps = pkgList(b.blocked_apps);
  if (b.always_allowed !== undefined) p.always_allowed = pkgList(b.always_allowed);
  if (b.bedtime !== undefined) p.bedtime = window(b.bedtime, false);
  if (b.school !== undefined) p.school = window(b.school, true);
  if (b.homework_lock_from !== undefined) p.homework_lock_from = hm(b.homework_lock_from);
  return p;
}

// POST /screen/report body, cleaned. Bad entries are dropped rather than failing the guard's whole report.
export const MAX_REPORT_APPS = 500;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s: unknown): s is string =>
  typeof s === "string" && DATE.test(s) && !isNaN(Date.parse(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;
const mins = (v: unknown) => Math.min(1440, Math.max(0, Math.round(Number(v) || 0)));
export function parseReport(b: any) {
  const list = Array.isArray(b?.apps) ? b.apps : [];
  if (list.length > MAX_REPORT_APPS) throw bad("Не больше 500 приложений");
  const apps: { pkg: string; name: string; installed_at: string | null }[] = [];
  const seen = new Set<string>();
  for (const a of list) {
    if (!a || !validPkg(a.pkg) || seen.has(a.pkg)) continue;
    seen.add(a.pkg);
    const t = typeof a.installed_at === "number" || typeof a.installed_at === "string" ? new Date(a.installed_at).getTime() : NaN;
    apps.push({ pkg: a.pkg, name: String(a.name ?? "").trim().slice(0, 80) || a.pkg, installed_at: isNaN(t) ? null : new Date(t).toISOString() });
  }
  const u = b?.usage && typeof b.usage === "object" ? b.usage : {};
  const usageApps: Record<string, number> = {};
  if (u.apps && typeof u.apps === "object" && !Array.isArray(u.apps)) {
    for (const [pkg, m] of Object.entries(u.apps).slice(0, MAX_REPORT_APPS)) if (validPkg(pkg)) usageApps[pkg] = mins(m);
  }
  const g = b?.guard && typeof b.guard === "object" ? b.guard : {};
  return {
    apps,
    usage: { date: validDate(u.date) ? u.date : null, total_min: mins(u.total_min), apps: usageApps },
    guard: { usage_access: !!g.usage_access, overlay: !!g.overlay, admin: !!g.admin, battery_ok: !!g.battery_ok, running: !!g.running },
  };
}

// Which of the reported, not yet seen packages count as new (blocked until a parent approves). The first report
// of a child is the baseline; a package with installed_at is new when it was installed after the rules were enabled.
export function classifyNewApps(
  apps: { pkg: string; name: string; installed_at: string | null }[],
  known: Set<string>,
  rules: ScreenRules,
  enabledAt: string | null,
) {
  const blocking = rules.enabled && rules.block_new_apps;
  const since = enabledAt ? Date.parse(enabledAt) : NaN;
  const baseline = known.size === 0;
  return apps.filter((a) => !known.has(a.pkg)).map((a) => {
    const decided = isExempt(rules, a.pkg) || rules.blocked_apps.includes(a.pkg) || rules.app_limits.some((l) => l.pkg === a.pkg);
    const isNew = blocking && !decided && (a.installed_at && !isNaN(since) ? Date.parse(a.installed_at) > since : !baseline);
    return { pkg: a.pkg, name: a.name, approved: !isNew };
  });
}

// Russian plural of "минута"
export function minutesRu(n: number) {
  const a = n % 10, b = n % 100;
  return `${n} ${a === 1 && b !== 11 ? "минуту" : a >= 2 && a <= 4 && (b < 12 || b > 14) ? "минуты" : "минут"}`;
}

// ---------- data ----------
async function rulesRow(kid: any) {
  const { data } = await db.from("app_screen_rules").select("*").eq("child_id", kid.child_id).eq("family_id", kid.id).maybeSingle();
  return data;
}
async function saveRules(kid: any, patch: Record<string, any>) {
  const { data, error } = await db.from("app_screen_rules")
    .upsert({ child_id: kid.child_id, family_id: kid.id, ...patch, updated_at: new Date().toISOString() }, { onConflict: "child_id" })
    .select("*").single();
  if (error) throw new HttpError(500, error.message);
  return toRules(data, kid.child_id);
}

// homework_done: every required task of the child's next school day is done (or its skip approved); the same day
// and tasks the child home (/child/state) shows. A day without required tasks counts as done. homework_due_today:
// that homework is due this evening (the evening before the school day, as for the reminders): Sunday before Monday
// yes, Friday before Monday no.
export async function homeworkOf(kid: any) {
  const { now, S, due, isSchool } = await activeDay(kid);
  await ensureTasks(kid, S);
  const req = (await loadTasks(kid, S)).filter((t) => t.required);
  return {
    homework_done: req.every(isDone), homework_date: S, homework_due_today: due === now.date, today: now.date, school_day: isSchool(now.date),
  };
}

async function seenOf(kid: any) {
  const { data } = await db.from("app_screen_seen").select("pkg, name, approved").eq("child_id", kid.child_id).eq("family_id", kid.id);
  return (data ?? []) as { pkg: string; name: string | null; approved: boolean }[];
}
const pendingOf = (seen: { pkg: string; approved: boolean }[]) => seen.filter((s) => !s.approved).map((s) => s.pkg).sort();
const approvedOf = (seen: { pkg: string; approved: boolean }[]) => seen.filter((s) => s.approved).map((s) => s.pkg).sort();
// what the guard needs to refresh fully from one call (GET /screen/rules and POST /screen/report)
const snapshot = (fam: any, seen: { pkg: string; approved: boolean }[]) => ({
  tz: fam.tz, lang: fam.lang ?? "ru", approved: approvedOf(seen), new_apps: pendingOf(seen),
});

async function deviceReport(kid: any, seen: { pkg: string; approved: boolean }[]) {
  const { data } = await db.from("app_screen_reports").select("device_id, apps, usage, guard, reported_at")
    .eq("family_id", kid.id).eq("child_id", kid.child_id).order("reported_at", { ascending: false }).limit(1);
  const r = data?.[0];
  if (!r) return null;
  return {
    device_id: r.device_id, apps: r.apps ?? [], usage: r.usage ?? {}, guard: r.guard ?? {}, reported_at: iso(r.reported_at),
    approved: approvedOf(seen),
  };
}

export async function listTextbooks(familyId: string, childId: number | null) {
  let q = db.from("app_textbooks").select("id, child_id, title, url, created_at").eq("family_id", familyId);
  if (childId) q = q.or(`child_id.is.null,child_id.eq.${Number(childId)}`);
  const { data } = await q.order("id");
  return data ?? [];
}

// http(s) links only, at most 500 characters
export function textbookUrl(v: unknown) {
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length > 500) throw bad("Ссылка длиннее 500 символов");
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw bad("Ссылка должна начинаться с http:// или https://");
  }
  if ((u.protocol !== "http:" && u.protocol !== "https:") || !u.hostname) throw bad("Ссылка должна начинаться с http:// или https://");
  return s;
}

async function notifyNewApps(kid: any, apps: { pkg: string; name: string | null }[]) {
  if (!apps.length) return;
  const names = apps.map((a) => a.name || a.pkg);
  const head = names.slice(0, 3).join(", ") + (names.length > 3 ? ` и ещё ${names.length - 3}` : "");
  await notifyParents(kid.id, { title: `Новое приложение: ${head}`, body: `${kid.child_name}: заблокировано, пока вы не разрешите` }, {
    html: `📱 <b>${esc(kid.child_name)}: новое приложение</b>\n${names.map(esc).join("\n")}\n\nРазрешите или заблокируйте его в «Уроки» → Экранное время.`,
  });
}

// ---------- routes ----------
type Dev = { id: string; family_id: string; role: "parent" | "child" | "viewer"; child_id: number | null };
const parentOnly = (d: Dev) => {
  if (d.role !== "parent") throw new HttpError(403, "Только для родителя");
};
async function readBody(req: Request) {
  return await req.json().catch(() => ({}));
}
// The child a call is about: a child device always means its own child; parents name one (a stale id is a 404,
// never a sibling), the first child otherwise.
const target = (fam: any, d: Dev, id: number | null) =>
  d.role === "child" ? kidOf(fam, d.child_id) : kidOf(fam, id || null, true);

export async function screenRoute(req: Request, path: string, seg: string[], d: Dev, fam: any, qChild: number | null): Promise<Response> {
  const M = req.method;

  if (path === "/screen/rules" && M === "GET") {
    const kid = await target(fam, d, qChild);
    const [row, hw, textbooks, seen] = await Promise.all([rulesRow(kid), homeworkOf(kid), listTextbooks(fam.id, kid.child_id), seenOf(kid)]);
    return json({
      rules: toRules(row, kid.child_id), ...hw, textbooks, device: await deviceReport(kid, seen), ...snapshot(fam, seen),
    });
  }

  if (path === "/screen/rules" && M === "PUT") {
    parentOnly(d);
    await limit(`screen:${fam.id}`, 300, 3600);
    const b = await readBody(req);
    const kid = await target(fam, d, Number(b?.child_id) || qChild);
    const patch = parseRulesPatch(b);
    if (patch.enabled === true && !(await rulesRow(kid))?.enabled) patch.enabled_at = new Date().toISOString();
    return json(await saveRules(kid, patch));
  }

  if (path === "/screen/unlock" && M === "POST") {
    parentOnly(d);
    await limit(`screen:${fam.id}`, 300, 3600);
    const b = await readBody(req);
    const kid = await target(fam, d, Number(b?.child_id) || qChild);
    const n = minutes(b?.minutes, 0, 240);
    const until = n ? new Date(Date.now() + n * 60_000).toISOString() : null;
    const rules = await saveRules(kid, { unlock_until: until });
    if (until) await notifyChild(fam.id, kid.child_id, `⏱ Родитель дал ${minutesRu(n)}`, `Телефон открыт до ${localParts(fam.tz, new Date(until)).hm}`);
    return json(rules);
  }

  if (path === "/screen/approve" && M === "POST") {
    parentOnly(d);
    await limit(`screen:${fam.id}`, 300, 3600);
    const b = await readBody(req);
    const kid = await target(fam, d, Number(b?.child_id) || qChild);
    if (!validPkg(b?.pkg)) throw bad("Неверное имя приложения");
    const pkg: string = b.pkg;
    if (!["allow", "block", "limit"].includes(b.action)) throw new HttpError(400, "Неизвестное действие");
    const cur = toRules(await rulesRow(kid), kid.child_id);
    const without = (l: string[]) => l.filter((x) => x !== pkg);
    const patch: Record<string, any> = {};
    if (b.action === "allow") {
      patch.always_allowed = [...without(cur.always_allowed), pkg];
      patch.blocked_apps = without(cur.blocked_apps);
    } else if (b.action === "block") {
      patch.blocked_apps = [...without(cur.blocked_apps), pkg];
      patch.always_allowed = without(cur.always_allowed);
    } else {
      const m = minutes(b.minutes);
      const seen = (await seenOf(kid)).find((s) => s.pkg === pkg);
      const name = seen?.name || String(b.name ?? "").trim().slice(0, 80) || cur.app_limits.find((l) => l.pkg === pkg)?.name || pkg;
      patch.app_limits = [...cur.app_limits.filter((l) => l.pkg !== pkg), { pkg, name, minutes: m }];
      patch.blocked_apps = without(cur.blocked_apps);
      patch.always_allowed = without(cur.always_allowed);
    }
    if ((patch.always_allowed?.length ?? 0) > 200 || (patch.blocked_apps?.length ?? 0) > 200) throw bad("Не больше 200 приложений в списке");
    if ((patch.app_limits?.length ?? 0) > 100) throw bad("Не больше 100 ограничений по приложениям");
    const rules = await saveRules(kid, patch);
    const { error } = await db.from("app_screen_seen").upsert({ child_id: kid.child_id, family_id: fam.id, pkg, approved: true }, { onConflict: "child_id,pkg" });
    if (error) throw new HttpError(500, error.message);
    return json(rules);
  }

  if (path === "/screen/report" && M === "POST") {
    if (d.role !== "child") throw new HttpError(403, "Только для ученика");
    await limit(`screenrep:${d.id}`, 120, 3600);
    const r = parseReport(await readBody(req));
    const kid = await target(fam, d, null);
    const { error } = await db.from("app_screen_reports").upsert({
      device_id: d.id, family_id: fam.id, child_id: kid.child_id, apps: r.apps, usage: r.usage, guard: r.guard, reported_at: new Date().toISOString(),
    }, { onConflict: "device_id" });
    if (error) throw new HttpError(500, error.message);
    // the report is stored even before the parent turned the rules on: they see the installed apps first
    const row = await rulesRow(kid);
    const rules = toRules(row, kid.child_id);
    let seen = await seenOf(kid);
    const fresh = classifyNewApps(r.apps, new Set(seen.map((s) => s.pkg)), rules, row?.enabled_at ?? null);
    if (fresh.length) {
      // the primary key makes "once per package" hold even for two reports at the same moment
      const { data: added } = await db.from("app_screen_seen")
        .upsert(fresh.map((f) => ({ ...f, child_id: kid.child_id, family_id: fam.id })), { onConflict: "child_id,pkg", ignoreDuplicates: true })
        .select("pkg, name, approved");
      await notifyNewApps(kid, (added ?? []).filter((a: any) => !a.approved));
      seen = await seenOf(kid);
    }
    return json({ ok: true, rules, ...(await homeworkOf(kid)), ...snapshot(fam, seen) });
  }

  if (seg[0] === "textbooks") {
    if (M === "GET" && seg.length === 1) {
      // a child reads its own + the family's shared links; parents/viewers one child's (?child=) or all of them
      if (d.role === "child") return json(await listTextbooks(fam.id, (await target(fam, d, null)).child_id));
      return json(await listTextbooks(fam.id, qChild ? (await target(fam, d, qChild)).child_id : null));
    }
    parentOnly(d);
    if (M === "POST" && seg.length === 1) {
      await limit(`tb:${fam.id}`, 60, 3600);
      const b = await readBody(req);
      const title = String(b?.title ?? "").trim().slice(0, 80);
      if (!title) throw new HttpError(400, "Название пустое");
      const url = textbookUrl(b?.url);
      let childId: number | null = null;
      if (b?.child_id != null) {
        childId = Number(b.child_id);
        if (!(await children(fam.id)).some((c) => c.id === childId)) throw new HttpError(404, "Ученик не найден");
      }
      const { count } = await db.from("app_textbooks").select("id", { count: "exact", head: true }).eq("family_id", fam.id);
      if ((count ?? 0) >= 100) throw bad("Не больше 100 учебников");
      const { data, error } = await db.from("app_textbooks").insert({ family_id: fam.id, child_id: childId, title, url })
        .select("id, child_id, title, url, created_at").single();
      if (error) throw new HttpError(500, error.message);
      return json(data);
    }
    if (M === "DELETE" && seg.length === 2) {
      await db.from("app_textbooks").delete().eq("id", Number(seg[1]) || 0).eq("family_id", fam.id);
      return json({ ok: true });
    }
  }
  throw new HttpError(404, "Не найдено");
}
