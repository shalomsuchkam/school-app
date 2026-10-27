// Unit tests for the pure parts of the backend: `deno test supabase/functions/app/logic_test.ts`.
// Env vars are stubbed so importing lib.ts (which creates the Supabase client) works offline.
Deno.env.set("SUPABASE_URL", Deno.env.get("SUPABASE_URL") ?? "http://localhost:54321");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "test");

const { accessOf, calendarStatus, nextSchoolDay, offReason, pickLessons, SCAN_DAYS, schoolDays, weekParity } = await import("./core.ts");
const { groupRanges, MAX_RANGE_DAYS, parseRange } = await import("./daysoff.ts");
const { normPromo, parsePromoCreate, promoOutcome, PROMO_ERRORS } = await import("./promo.ts");

const { isHoliday, holidaysBetween } = await import("./holidays.ts");
const { tr } = await import("./i18n.ts");
const { addDays, audioType, dow, imageType, inQuiet, safeEq, validTz } = await import("./lib.ts");
const { inviteCode, inviteLang } = await import("./invite.ts");

function eq(a: unknown, b: unknown, msg?: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg ?? "not equal"}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
}

Deno.test("dates: addDays across months and dow", () => {
  eq(addDays("2026-10-31", 1), "2026-11-01");
  eq(addDays("2026-03-01", -1), "2026-02-28");
  eq(dow("2026-10-15"), 4); // Thursday
  eq(dow("2026-10-18"), 7); // Sunday
});

Deno.test("school days skip weekends, days off and holidays", () => {
  const isSchool = schoolDays([1, 2, 3, 4, 5], new Set(["2026-10-19"]), (d) => isHoliday("KZ", d));
  eq(nextSchoolDay("2026-10-16", isSchool), "2026-10-20"); // Fri -> (weekend, Mon off) -> Tue
  eq(isSchool("2026-10-26"), true); // a regular Monday
  eq(isSchool("2026-12-16"), false); // Independence Day (Wednesday)
});

Deno.test("Kazakhstan public holidays", () => {
  eq(isHoliday("KZ", "2026-03-22"), true); // Nauryz
  eq(isHoliday("KZ", "2026-05-27"), true); // Kurban Ait 2026
  eq(isHoliday("KZ", "2026-10-15"), false);
  eq(holidaysBetween("KZ", "2026-12-14", "2026-12-20"), ["2026-12-16"]);
});

Deno.test("alternating weeks: ISO week parity", () => {
  eq(weekParity("2026-01-05"), 2); // ISO week 2
  eq(weekParity("2026-01-01"), 1); // ISO week 1
  eq(weekParity("2026-10-12") !== weekParity("2026-10-19"), true);
  // 2026 has 53 ISO weeks: parity must still alternate into 2027
  eq(weekParity("2026-12-28") !== weekParity("2027-01-04"), true);
  eq(weekParity("2026-12-31"), weekParity("2026-12-28"));
});

Deno.test("subscription access", () => {
  const future = new Date(Date.now() + 86400_000).toISOString();
  const past = new Date(Date.now() - 86400_000).toISOString();
  eq(accessOf({}, false).active, true, "billing off -> open");
  eq(accessOf({}, true).active, false, "billing on, nothing -> closed");
  eq(accessOf({ paid_until: future }, true).active, true);
  eq(accessOf({ paid_until: past }, true).active, false);
  eq(accessOf({ granted_until: future }, true).active, true);
  eq(accessOf({ free_forever: true }, true).active, true);
  eq(accessOf({ paid_until: future, billing_period: "trial" }, true).trial, true);
});

Deno.test("guards: constant-time compare, image sniffing, time zones", () => {
  eq(safeEq("abc", "abc"), true);
  eq(safeEq("abc", "abd"), false);
  eq(safeEq("abc", "abcd"), false);
  eq(safeEq("", ""), false);
  eq(safeEq(null, "x"), false);
  eq(imageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  eq(imageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])), "image/png");
  eq(imageType(new TextEncoder().encode("<html>")), null);
  eq(validTz("Asia/Almaty"), "Asia/Almaty");
  eq(validTz("Mars/Olympus"), null);
});

Deno.test("server messages are translated by x-lang", () => {
  eq(tr("ru", "Нечего отменять"), "Нечего отменять");
  eq(tr("en", "Нечего отменять"), "Nothing to undo");
  eq(tr("en", "👍 Принято: Математика"), "👍 Accepted: Математика");
  eq(tr("kk", "неизвестное"), "неизвестное");
});

Deno.test("voice notes: audio sniffing", () => {
  const ftyp = (brand: string) => new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, ...new TextEncoder().encode(brand), 0, 0, 0, 0]);
  eq(audioType(ftyp("M4A ")), "audio/mp4");
  eq(audioType(ftyp("mp42")), "audio/mp4");
  eq(audioType(ftyp("heic")), null, "HEIC photo is not audio");
  eq(audioType(new Uint8Array([0xff, 0xf1, 0x50, 0x80])), "audio/aac"); // ADTS, MPEG-4
  eq(audioType(new Uint8Array([0xff, 0xf9, 0x50, 0x80])), "audio/aac"); // ADTS, MPEG-2
  eq(audioType(new Uint8Array([0x49, 0x44, 0x33, 0x04, 0])), "audio/mpeg"); // ID3
  eq(audioType(new Uint8Array([0xff, 0xfb, 0x90, 0x64])), "audio/mpeg"); // MPEG-1 layer III frame
  eq(audioType(new Uint8Array([0xff, 0xe0, 0, 0])), null, "reserved layer");
  eq(audioType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), null, "JPEG");
  eq(audioType(new TextEncoder().encode("<html>")), null);
  eq(audioType(new Uint8Array([])), null);
});

Deno.test("quiet hours window, including across midnight", () => {
  eq(inQuiet("23:00", "22:00", "07:00"), true);
  eq(inQuiet("03:15", "22:00", "07:00"), true);
  eq(inQuiet("07:00", "22:00", "07:00"), false, "end is exclusive");
  eq(inQuiet("22:00", "22:00", "07:00"), true, "start is inclusive");
  eq(inQuiet("12:00", "22:00", "07:00"), false);
  eq(inQuiet("14:00", "13:00", "15:00"), true);
  eq(inQuiet("15:00", "13:00", "15:00"), false);
  eq(inQuiet("12:59", "13:00", "15:00"), false);
  eq(inQuiet("12:00", null, null), false);
  eq(inQuiet("12:00", "12:00", "12:00"), false, "empty window");
});

Deno.test("month calendar: day status", () => {
  const base = { today: "2026-10-15", school: true, tz: "Asia/Almaty", soft: "17:30" };
  // Almaty is UTC+5: 12:00Z = 17:00 local, 13:00Z = 18:00 local
  const onTime = { status: "done", done_at: "2026-10-13T12:00:00Z" };
  const late = { status: "done", done_at: "2026-10-13T13:00:00Z" };
  const todo = { status: "todo", done_at: null };
  eq(calendarStatus({ ...base, date: "2026-10-14", tasks: [onTime, { status: "skip_ok", done_at: "2026-10-13T11:00:00Z" }] }), { date: "2026-10-14", status: "done_on_time", total: 2, done: 2 });
  eq(calendarStatus({ ...base, date: "2026-10-14", tasks: [onTime, late] }).status, "done_late");
  eq(calendarStatus({ ...base, date: "2026-10-14", tasks: [onTime, todo] }), { date: "2026-10-14", status: "partial", total: 2, done: 1 });
  eq(calendarStatus({ ...base, date: "2026-10-15", tasks: [todo, todo] }).status, "missed", "today's deadline was last evening");
  eq(calendarStatus({ ...base, date: "2026-10-16", tasks: [todo] }).status, "future");
  eq(calendarStatus({ ...base, date: "2026-10-16", tasks: [{ status: "done", done_at: "2026-10-15T10:00:00Z" }] }).status, "done_on_time", "finished ahead");
  eq(calendarStatus({ ...base, date: "2026-10-20", tasks: [] }).status, "future");
  eq(calendarStatus({ ...base, date: "2026-10-12", tasks: [] }).status, "empty");
  eq(calendarStatus({ ...base, date: "2026-10-11", school: false, tasks: [] }).status, "off");
  eq(calendarStatus({ ...base, date: "2026-10-11", school: false, tasks: [todo] }).status, "off");
  eq(calendarStatus({ ...base, date: "2026-10-11", school: false, tasks: [{ status: "done", done_at: "2026-10-10T10:00:00Z" }] }).status, "done_on_time");
});

Deno.test("one-day override replaces the timetable's lessons", () => {
  const rows = [
    { pos: 1, week_parity: 0, subject_id: 10 },
    { pos: 2, week_parity: 0, subject_id: 11 },
  ];
  eq(pickLessons(rows, 1, null), [{ subject_id: 10, pos: 1 }, { subject_id: 11, pos: 2 }]);
  eq(pickLessons(rows, 1, [12, 10]), [{ subject_id: 12, pos: 1 }, { subject_id: 10, pos: 2 }], "override order");
  eq(pickLessons(rows, 1, []), [], "empty override = no lessons");
  const alt = [
    { pos: 1, week_parity: 0, subject_id: 10 },
    { pos: 1, week_parity: 1, subject_id: 20 },
    { pos: 1, week_parity: 2, subject_id: 30 },
  ];
  eq(pickLessons(alt, 2, null), [{ subject_id: 30, pos: 1 }]);
  eq(pickLessons(alt, 2, [40]), [{ subject_id: 40, pos: 1 }]);
});

Deno.test("invite page: language and code cleanup", () => {
  eq(inviteLang("kk", "en-US"), "kk");
  eq(inviteLang(null, "de-DE,en;q=0.8,ru;q=0.5"), "en");
  eq(inviteLang("xx", "kk-KZ"), "kk");
  eq(inviteLang(null, null), "ru");
  eq(inviteCode("ab<script>12"), "ABSCRIPT12");
  eq(inviteCode("x".repeat(40)).length, 12);
});

Deno.test("new server messages are translated", () => {
  eq(tr("en", "Это не аудиозапись"), "This is not an audio recording");
  eq(tr("kk", "Тихие часы: укажите начало и конец в формате ЧЧ:ММ"), "Тыныш сағаттар: басы мен соңын СС:ММ пішімінде көрсетіңіз");
  eq(tr("en", "Длительность: от 1 до 240 минут"), "Duration: 1 to 240 minutes");
});

// ---------- screen time (docs/SCREEN_TIME.md "Decision order"; the Kotlin guard mirrors these cases) ----------
const S = await import("./screen.ts");
const { screenDecision, defaultRules, parseRulesPatch, parseReport, classifyNewApps, toRules, countedTotal, minutesRu, textbookUrl } = S;
type Rules = ReturnType<typeof defaultRules>;
type Ctx = Parameters<typeof screenDecision>[1];
const rules = (p: Partial<Rules> = {}): Rules => ({ ...defaultRules(12), enabled: true, ...p });
const ctx = (p: Record<string, unknown> = {}): Ctx => ({
  pkg: "com.game", nowLocalHM: "12:00", isoWeekday: 3, isSchoolDay: true, homeworkDone: true, homeworkDueToday: true, usageApp: 0, usageTotal: 0,
  isNew: false, approved: true, nowUtc: "2026-10-22T10:00:00Z", ...p,
} as Ctx);
const why = (r: Rules | null, c: Record<string, unknown> = {}) => screenDecision(r, ctx(c)).reason;
const allowed = (r: Rules | null, c: Record<string, unknown> = {}) => screenDecision(r, ctx(c)).allow;
const throws = (f: () => unknown, msg: string) => {
  try {
    f();
  } catch (e) {
    eq((e as Error).message, msg);
    return;
  }
  throw new Error(`expected "${msg}"`);
};

Deno.test("screen: 1 disabled or missing rules allow everything", () => {
  eq(allowed(null), true);
  eq(allowed(rules({ enabled: false, blocked_apps: ["com.game"], daily_limit_min: 1 }), { usageTotal: 999 }), true);
  eq(screenDecision(rules(), ctx()), { allow: true, reason: null }, "11: nothing applies");
});

Deno.test("screen: 2 system packages and always_allowed are never blocked", () => {
  const strict = rules({
    blocked_apps: ["kz.uroki.app", "com.android.dialer", "com.whatsapp"], block_new_apps: true, daily_limit_min: 10,
    bedtime: { from: "00:00", to: "23:59", allowed: [] }, homework_lock: true, homework_lock_from: "00:00",
    app_limits: [{ pkg: "com.whatsapp", name: "WhatsApp", minutes: 1 }],
  });
  const worst = { isNew: true, approved: false, homeworkDone: false, usageApp: 999, usageTotal: 999 };
  for (const pkg of ["kz.uroki.app", "com.android.dialer", "com.google.android.dialer", "com.android.systemui", "com.android.launcher3", "com.google.android.apps.messaging"]) {
    eq(allowed(strict, { ...worst, pkg }), true, pkg);
  }
  eq(why(strict, { ...worst, pkg: "com.whatsapp" }), "blocked", "not yet always-allowed");
  eq(allowed({ ...strict, always_allowed: ["com.whatsapp"] }, { ...worst, pkg: "com.whatsapp" }), true, "always_allowed beats blocked/limits");
  eq(why(strict, { ...worst, pkg: "com.android.settings" }), "new_app", "settings only during guard setup");
  eq(why(strict, { ...worst, isNew: false, pkg: "com.android.settings" }), "bedtime");
  eq(allowed(strict, { ...worst, pkg: "com.android.settings", setupOpen: true }), true);
  eq(allowed(strict, { ...worst, pkg: "com.vendor.home", isSystem: true }), true, "device-resolved launcher");
  eq(S.SYSTEM_PACKAGES.includes("com.android.settings"), false);
});

Deno.test("screen: 3 unlock_until in the future allows, in the past does not", () => {
  const r = rules({ blocked_apps: ["com.game"], unlock_until: "2026-10-22T10:30:00Z" });
  eq(allowed(r), true);
  eq(allowed(r, { nowUtc: "2026-10-22T10:30:00Z" }), false, "ends exactly at unlock_until");
  eq(why(r, { nowUtc: new Date("2026-10-22T11:00:00Z") }), "blocked");
  eq(allowed(r, { nowUtc: Date.parse("2026-10-22T10:29:00Z") }), true, "ms timestamps work too");
  eq(allowed(rules({ daily_limit_min: 5, unlock_until: "2026-10-22T10:30:00Z" }), { usageTotal: 60 }), true, "bonus time beats the limit");
});

Deno.test("screen: 4 blocked apps, 5 new apps", () => {
  eq(why(rules({ blocked_apps: ["com.game"] })), "blocked");
  eq(why(rules({ blocked_apps: ["com.other"] })), null);
  const r = rules({ block_new_apps: true });
  eq(why(r, { isNew: true, approved: false }), "new_app");
  eq(why(r, { isNew: true, approved: true }), null, "approved");
  eq(why(r, { isNew: false, approved: false }), null, "baseline app");
  eq(why(rules({ block_new_apps: false }), { isNew: true, approved: false }), null, "switch off");
  eq(why(rules({ block_new_apps: true, blocked_apps: ["com.game"] }), { isNew: true, approved: false }), "blocked", "4 before 5");
});

Deno.test("screen: 6 bedtime window across midnight", () => {
  const r = rules({ bedtime: { from: "21:30", to: "07:00", allowed: ["com.audiobooks"] }, daily_limit_min: 10 });
  eq(why(r, { nowLocalHM: "21:29" }), null);
  eq(why(r, { nowLocalHM: "21:30" }), "bedtime", "start inclusive");
  eq(why(r, { nowLocalHM: "23:59" }), "bedtime");
  eq(why(r, { nowLocalHM: "00:00" }), "bedtime");
  eq(why(r, { nowLocalHM: "06:59" }), "bedtime");
  eq(why(r, { nowLocalHM: "07:00" }), null, "end exclusive");
  eq(allowed(r, { nowLocalHM: "22:00", pkg: "com.audiobooks", usageTotal: 999 }), true, "window's allowed apps run, limits not checked");
  eq(why(r, { nowLocalHM: "12:00", pkg: "com.audiobooks", usageTotal: 999 }), "daily_limit", "outside the window limits apply");
  eq(why({ ...r, blocked_apps: ["com.audiobooks"] }, { nowLocalHM: "22:00", pkg: "com.audiobooks" }), "blocked", "4 before 6");
  eq(why(rules({ bedtime: { from: "13:00", to: "15:00", allowed: [] } }), { nowLocalHM: "14:00" }), "bedtime", "same-day window");
});

Deno.test("screen: 7 school window only on listed days", () => {
  const r = rules({ school: { from: "08:00", to: "14:00", days: [1, 2, 3, 4, 5], allowed: ["com.calculator"] } });
  eq(why(r, { nowLocalHM: "09:00" }), "school");
  eq(why(r, { nowLocalHM: "09:00", isoWeekday: 6 }), null, "Saturday");
  eq(why(r, { nowLocalHM: "09:00", isSchoolDay: false }), null, "holiday or day off on a listed weekday");
  eq(why(r, { nowLocalHM: "09:00", homeworkDueToday: false }), "school", "independent of the homework day");
  eq(why(r, { nowLocalHM: "07:59" }), null);
  eq(why(r, { nowLocalHM: "14:00" }), null, "end exclusive");
  eq(allowed(r, { nowLocalHM: "09:00", pkg: "com.calculator" }), true);
  const night = rules({ school: { from: "23:00", to: "01:00", days: [3], allowed: [] } });
  eq(why(night, { nowLocalHM: "00:30", isoWeekday: 3 }), "school", "crosses midnight, weekday of the current local date");
  const both = rules({ bedtime: { from: "07:00", to: "09:00", allowed: [] }, school: { from: "08:00", to: "14:00", days: [3], allowed: [] } });
  eq(why(both, { nowLocalHM: "08:30" }), "bedtime", "6 before 7");
});

Deno.test("screen: 8 homework lock", () => {
  const r = rules({ homework_lock: true, homework_lock_from: "15:00" });
  eq(why(r, { nowLocalHM: "15:00", homeworkDone: false }), "homework");
  eq(why(r, { nowLocalHM: "23:59", homeworkDone: false }), "homework");
  eq(why(r, { nowLocalHM: "14:59", homeworkDone: false }), null, "before lock_from");
  eq(why(r, { nowLocalHM: "16:00", homeworkDone: true }), null, "done");
  eq(why(r, { nowLocalHM: "16:00", homeworkDone: false, homeworkDueToday: false }), null, "Friday before Monday: due on Sunday");
  eq(why(r, { nowLocalHM: "16:00", homeworkDone: false, homeworkDueToday: true, isSchoolDay: false, isoWeekday: 7 }), "homework", "Sunday before Monday");
  eq(why(r, { nowLocalHM: "16:00", homeworkDone: false, homeworkDueToday: false, isSchoolDay: true }), null, "school day before a holiday");
  eq(why(rules({ homework_lock: false }), { nowLocalHM: "16:00", homeworkDone: false }), null, "off");
  eq(why({ ...r, app_limits: [{ pkg: "com.game", name: "G", minutes: 5 }] }, { nowLocalHM: "16:00", homeworkDone: false, usageApp: 99 }), "homework", "8 before 9");
});

Deno.test("screen: 9 app limits, 10 daily limit", () => {
  const r = rules({ app_limits: [{ pkg: "com.game", name: "Game", minutes: 30 }], daily_limit_min: 120 });
  eq(why(r, { usageApp: 29, usageTotal: 29 }), null);
  eq(why(r, { usageApp: 30, usageTotal: 30 }), "app_limit", "reached");
  eq(why(r, { pkg: "com.other", usageApp: 30, usageTotal: 30 }), null, "other apps unaffected");
  eq(why(r, { usageApp: 31, usageTotal: 200 }), "app_limit", "9 before 10");
  eq(why(r, { pkg: "com.other", usageTotal: 120 }), "daily_limit");
  eq(why(r, { pkg: "com.other", usageTotal: 119 }), null);
  eq(why(rules({ daily_limit_min: null }), { usageTotal: 10_000 }), null, "no overall limit");
  eq(countedTotal(rules({ always_allowed: ["com.whatsapp"] }), { "com.game": 20, "com.whatsapp": 50, "kz.uroki.app": 30, "com.android.dialer": 5 }), 20);
});

Deno.test("screen: rules patch validation", () => {
  eq(parseRulesPatch({ enabled: true, child_id: 5, unlock_until: "2030-01-01T00:00:00Z", updated_at: "x" }), { enabled: true }, "read-only fields ignored");
  eq(parseRulesPatch({ daily_limit_min: null }), { daily_limit_min: null });
  eq(parseRulesPatch({ daily_limit_min: 1440 }).daily_limit_min, 1440);
  throws(() => parseRulesPatch({ daily_limit_min: 0 }), "Минуты: от 1 до 1440");
  throws(() => parseRulesPatch({ daily_limit_min: 1441 }), "Минуты: от 1 до 1440");
  throws(() => parseRulesPatch({ daily_limit_min: 1.5 }), "Минуты: от 1 до 1440");
  throws(() => parseRulesPatch({ enabled: "yes" }), "Неверные правила");
  eq(parseRulesPatch({ blocked_apps: ["a.b", "a.b", "c_d.e"] }).blocked_apps, ["a.b", "c_d.e"], "deduped");
  throws(() => parseRulesPatch({ blocked_apps: ["com.bad app"] }), "Неверное имя приложения");
  throws(() => parseRulesPatch({ always_allowed: ["x".repeat(201)] }), "Неверное имя приложения");
  throws(() => parseRulesPatch({ always_allowed: Array.from({ length: 201 }, (_, i) => `p${i}`) }), "Не больше 200 приложений в списке");
  eq(parseRulesPatch({ always_allowed: Array.from({ length: 200 }, (_, i) => `p${i}`) }).always_allowed.length, 200);
  eq(parseRulesPatch({ app_limits: [{ pkg: "a.b", minutes: 5 }, { pkg: "a.b", name: " TikTok ", minutes: 30 }] }).app_limits, [{ pkg: "a.b", name: "TikTok", minutes: 30 }]);
  throws(() => parseRulesPatch({ app_limits: Array.from({ length: 101 }, (_, i) => ({ pkg: `p${i}`, minutes: 1 })) }), "Не больше 100 ограничений по приложениям");
  throws(() => parseRulesPatch({ app_limits: [{ pkg: "a.b", minutes: 0 }] }), "Минуты: от 1 до 1440");
  eq(parseRulesPatch({ bedtime: { from: "21:30", to: "07:00" } }).bedtime, { from: "21:30", to: "07:00", allowed: [] });
  eq(parseRulesPatch({ bedtime: null }).bedtime, null);
  throws(() => parseRulesPatch({ bedtime: { from: "24:00", to: "07:00" } }), "Время в формате ЧЧ:ММ");
  throws(() => parseRulesPatch({ bedtime: { from: "7:00", to: "08:00" } }), "Время в формате ЧЧ:ММ");
  throws(() => parseRulesPatch({ bedtime: { from: "07:00", to: "07:00" } }), "Начало и конец совпадают");
  eq(parseRulesPatch({ school: { from: "08:00", to: "14:00" } }).school.days, [1, 2, 3, 4, 5], "default days");
  eq(parseRulesPatch({ school: { from: "08:00", to: "14:00", days: [5, 1, 1] } }).school.days, [1, 5]);
  throws(() => parseRulesPatch({ school: { from: "08:00", to: "14:00", days: [0] } }), "День недели 1–7");
  throws(() => parseRulesPatch({ school: { from: "08:00", to: "14:00", days: [] } }), "День недели 1–7");
  throws(() => parseRulesPatch({ homework_lock_from: "3pm" }), "Время в формате ЧЧ:ММ");
});

Deno.test("screen: defaults and stored rows", () => {
  const d = toRules(null, 7);
  eq([d.child_id, d.enabled, d.daily_limit_min, d.bedtime, d.school, d.homework_lock_from, d.unlock_until], [7, false, null, null, null, "15:00", null]);
  eq([d.app_limits, d.blocked_apps, d.always_allowed], [[], [], []]);
  const r = toRules({ enabled: true, school: { from: "08:00", to: "14:00" }, unlock_until: "2026-10-22T18:30:00+00:00" }, 7);
  eq(r.school, { from: "08:00", to: "14:00", days: [1, 2, 3, 4, 5], allowed: [] });
  eq(r.unlock_until, "2026-10-22T18:30:00.000Z");
});

Deno.test("screen: device report cleanup", () => {
  const r = parseReport({
    apps: [{ pkg: "com.a", name: " A ", installed_at: 1761127200000 }, { pkg: "com.a", name: "dup" }, { pkg: "bad pkg" }, { pkg: "com.b", name: "x".repeat(100), installed_at: "nope" }],
    usage: { date: "2026-10-22", total_min: 30.4, apps: { "com.a": 20, "bad pkg": 5, "com.b": -3 } },
    guard: { usage_access: true, overlay: 1 },
  });
  eq(r.apps.map((a) => a.pkg), ["com.a", "com.b"]);
  eq(r.apps[0], { pkg: "com.a", name: "A", installed_at: "2025-10-22T10:00:00.000Z" });
  eq([r.apps[1].name.length, r.apps[1].installed_at], [80, null]);
  eq(r.usage, { date: "2026-10-22", total_min: 30, apps: { "com.a": 20, "com.b": 0 } });
  eq(r.guard, { usage_access: true, overlay: true, battery_ok: false, running: false });
  eq(parseReport({ usage: { date: "2026-02-30" } }).usage.date, null);
  eq(parseReport({}).apps, []);
  throws(() => parseReport({ apps: Array.from({ length: 501 }, (_, i) => ({ pkg: `p${i}` })) }), "Не больше 500 приложений");
});

Deno.test("screen: new-app detection", () => {
  const on = rules({ block_new_apps: true, always_allowed: ["com.whatsapp"], app_limits: [{ pkg: "com.tiktok", name: "T", minutes: 5 }] });
  const app = (pkg: string, installed_at: string | null = null) => ({ pkg, name: pkg, installed_at });
  const enabledAt = "2026-10-20T00:00:00Z";
  eq(classifyNewApps([app("com.a"), app("com.b")], new Set(), on, enabledAt).map((x) => x.approved), [true, true], "first report = baseline");
  eq(classifyNewApps([app("com.a"), app("com.c")], new Set(["com.a"]), on, enabledAt), [{ pkg: "com.c", name: "com.c", approved: false }], "only unseen");
  eq(classifyNewApps([app("com.c", "2026-10-21T00:00:00Z")], new Set(), on, enabledAt)[0].approved, false, "installed after enabling, even in the first report");
  eq(classifyNewApps([app("com.c", "2026-10-19T00:00:00Z")], new Set(["com.a"]), on, enabledAt)[0].approved, true, "installed before enabling");
  eq(classifyNewApps([app("com.whatsapp"), app("com.tiktok"), app("com.android.dialer")], new Set(["x"]), on, enabledAt).every((x) => x.approved), true, "already decided or system");
  eq(classifyNewApps([app("com.c")], new Set(["x"]), { ...on, block_new_apps: false }, enabledAt)[0].approved, true, "switch off");
  eq(classifyNewApps([app("com.c")], new Set(["x"]), { ...on, enabled: false }, enabledAt)[0].approved, true, "rules off");
});

Deno.test("screen: textbook links and texts", () => {
  eq(textbookUrl(" https://okulyk.kz/book/1 "), "https://okulyk.kz/book/1");
  eq(textbookUrl("http://x.kz"), "http://x.kz");
  throws(() => textbookUrl("javascript:alert(1)"), "Ссылка должна начинаться с http:// или https://");
  throws(() => textbookUrl("file:///etc/passwd"), "Ссылка должна начинаться с http:// или https://");
  throws(() => textbookUrl("okulyk.kz"), "Ссылка должна начинаться с http:// или https://");
  throws(() => textbookUrl("https://x.kz/" + "a".repeat(500)), "Ссылка длиннее 500 символов");
  eq([minutesRu(1), minutesRu(3), minutesRu(5), minutesRu(11), minutesRu(21), minutesRu(22), minutesRu(240)], ["1 минуту", "3 минуты", "5 минут", "11 минут", "21 минуту", "22 минуты", "240 минут"]);
  eq(tr("en", "Минуты: от 0 до 240"), "Minutes: 0 to 240");
  eq(tr("kk", "Неверное имя приложения"), "Қолданба атауы қате");
});

// ---------- vacations (POST /parent/days-off) ----------
const TODAY = "2026-10-27";
Deno.test("vacations: range validation and expansion", () => {
  const r = parseRange({ from: "2026-12-29", to: "2027-01-11", off: true, note: "  Зимние   каникулы " }, TODAY);
  eq([r.from, r.to, r.off, r.note, r.dates.length], ["2026-12-29", "2027-01-11", true, "Зимние каникулы", 14]);
  eq([r.dates[0], r.dates[3], r.dates[13]], ["2026-12-29", "2027-01-01", "2027-01-11"], "across the new year, weekends included");
  eq(parseRange({ from: "2026-11-02", off: false }, TODAY).dates, ["2026-11-02"], "to defaults to from");
  eq(parseRange({ from: "2026-11-02", to: "2026-11-02", off: true, note: "  " }, TODAY).note, null);
  eq(parseRange({ from: "2026-11-02", to: "2026-11-02", off: true, note: "x".repeat(80) }, TODAY).note?.length, 40);
  eq(parseRange({ from: "2027-06-01", to: addDays("2027-06-01", MAX_RANGE_DAYS - 1), off: true }, TODAY).dates.length, 120, "120 days is fine");
  throws(() => parseRange({ from: "2027-06-01", to: addDays("2027-06-01", MAX_RANGE_DAYS), off: true }, TODAY), "Не больше 120 дней за раз");
  throws(() => parseRange({ from: "2026-12-10", to: "2026-12-01", off: true }, TODAY), "Дата «по» раньше даты «с»");
  throws(() => parseRange({ from: "2026-02-30", to: "2026-03-02", off: true }, TODAY), "Неверная дата");
  throws(() => parseRange({ from: "27.12.2026", off: true }, TODAY), "Неверная дата");
  throws(() => parseRange({}, TODAY), "Неверная дата");
  throws(() => parseRange({ from: "2026-12-29", to: "2027-01-11" }, TODAY), "Неизвестное действие");
  throws(() => parseRange({ from: "2026-12-29", to: "2027-01-11", off: "yes" }, TODAY), "Неизвестное действие");
  // window: today - 30 .. today + 400
  eq(parseRange({ from: "2026-09-27", to: "2026-09-30", off: true }, TODAY).dates.length, 4, "30 days back is allowed");
  throws(() => parseRange({ from: "2026-09-26", to: "2026-09-30", off: true }, TODAY), "Даты: от 30 дней назад до 400 дней вперёд");
  eq(parseRange({ from: "2027-12-01", to: "2027-12-01", off: true }, TODAY).dates.length, 1, "day 400");
  throws(() => parseRange({ from: "2027-12-01", to: "2027-12-02", off: true }, TODAY), "Даты: от 30 дней назад до 400 дней вперёд");
  eq(tr("en", "Не больше 120 дней за раз"), "At most 120 days at a time");
  eq(tr("kk", "Дата «по» раньше даты «с»"), "«Дейін» күні «бастап» күнінен ерте");
});

Deno.test("vacations: consecutive days with one name are one range", () => {
  const rows = [
    { date: "2027-01-02", note: "Зимние" }, { date: "2026-12-29", note: "Зимние" }, { date: "2026-12-30", note: "Зимние" },
    { date: "2026-12-31", note: "Зимние" }, { date: "2027-01-01", note: "Зимние" },
    { date: "2026-11-06", note: null }, { date: "2026-11-09" }, { date: "2026-11-10", note: null },
    { date: "2027-01-03", note: "Другое" }, { date: "2027-01-03", note: "Другое" },
  ];
  eq(groupRanges(rows), [
    { from: "2026-11-06", to: "2026-11-06", note: null, days: 1 },
    { from: "2026-11-09", to: "2026-11-10", note: null, days: 2 },
    { from: "2026-12-29", to: "2027-01-02", note: "Зимние", days: 5 },
    { from: "2027-01-03", to: "2027-01-03", note: "Другое", days: 1 },
  ]);
  eq(groupRanges([]), []);
});

Deno.test("vacations: school days, the next school day and calendar reasons follow app_days_off", () => {
  // a 92-day summer break written as rows: the next school day is found after it, not "tomorrow"
  const off = new Set<string>();
  for (let d = "2027-05-26"; d <= "2027-08-31"; d = addDays(d, 1)) off.add(d);
  const isSchool = schoolDays([1, 2, 3, 4, 5], off, (d) => isHoliday("KZ", d));
  eq(nextSchoolDay("2027-05-25", isSchool), "2027-09-01", "Tue before the break -> Wed 1 September");
  eq(isSchool("2027-06-15"), false);
  // winter break: Monday after it is the next school day
  const winter = new Set<string>();
  for (let d = "2026-12-29"; d <= "2027-01-11"; d = addDays(d, 1)) winter.add(d);
  eq(nextSchoolDay("2026-12-28", schoolDays([1, 2, 3, 4, 5], winter)), "2027-01-12");
  eq(SCAN_DAYS >= 400, true, "the search reaches past the furthest allowed day off");
  const notes = new Map<string, string | null>([["2026-12-30", "Зимние"], ["2026-11-06", null]]);
  const kz = (d: string) => isHoliday("KZ", d);
  eq(offReason("2026-12-30", notes, kz), { off: "day_off", note: "Зимние" });
  eq(offReason("2026-11-06", notes, kz), { off: "day_off", note: null });
  eq(offReason("2026-12-16", notes, kz), { off: "holiday", note: null });
  eq(offReason("2026-12-16", notes), { off: "weekend", note: null }, "auto holidays off");
  eq(offReason("2026-10-31", notes, kz), { off: "weekend", note: null });
});

// ---------- promo codes ----------
Deno.test("promo: code normalisation", () => {
  eq(normPromo("  sneg-2k26 "), "SNEG2K26");
  eq(normPromo("ab cd_ef.gh"), "ABCDEFGH");
  eq(normPromo("ZIMA2026"), null, "I and 0 are not in the alphabet");
  eq(normPromo("ABC12"), null, "1 is ambiguous");
  eq(normPromo("ABCDE"), null, "too short");
  eq(normPromo("A".repeat(17)), null, "too long");
  eq(normPromo("A".repeat(16)), "A".repeat(16));
  eq(normPromo("ПРОМО2K26"), null);
  eq(normPromo(123456), null);
  eq(normPromo(undefined), null);
});

Deno.test("promo: redemption outcomes are translated server errors", () => {
  eq(promoOutcome("ok"), undefined);
  const status = (s: string) => {
    try {
      promoOutcome(s);
    } catch (e) {
      return [(e as { status: number }).status, (e as Error).message];
    }
    return null;
  };
  eq(status("not_found"), [404, "Промокод не найден"]);
  eq(status("used"), [409, "Промокод уже использован"]);
  eq(status("expired"), [410, "Срок действия промокода истёк"]);
  eq(status("weird")?.[0], 500);
  for (const [, msg] of Object.values(PROMO_ERRORS)) {
    eq(tr("en", msg) !== msg && tr("kk", msg) !== msg, true, `translated: ${msg}`);
  }
  eq(tr("en", "Промокод уже использован"), "This promo code has already been used");
});

Deno.test("promo: owner's create request", () => {
  eq(parsePromoCreate({}), { p_days: null, p_max_uses: 1, p_expires: null, p_note: null, p_code: null }, "forever, one use, random code");
  eq(parsePromoCreate({ days: 365, max_uses: 10, note: " Школа 5 ", code: "shk-5kz" }), {
    p_days: 365, p_max_uses: 10, p_expires: null, p_note: "Школа 5", p_code: "SHK5KZ",
  });
  eq(parsePromoCreate({ days: null }).p_days, null, "null = forever");
  eq(parsePromoCreate({ expires_at: "2099-01-01" }).p_expires, "2099-01-01T00:00:00.000Z");
  throws(() => parsePromoCreate({ days: 0 }), "days: 1–3650 (or null = forever)");
  throws(() => parsePromoCreate({ days: 1.5 }), "days: 1–3650 (or null = forever)");
  throws(() => parsePromoCreate({ max_uses: 0 }), "max_uses: 1–100000");
  throws(() => parsePromoCreate({ expires_at: "2020-01-01" }), "expires_at: a future date/time");
  throws(() => parsePromoCreate({ expires_at: "soon" }), "expires_at: a future date/time");
  throws(() => parsePromoCreate({ code: "ONE1" }), "code: 6–16 of A–Z, 2–9 (no 0, O, 1, I)");
});
