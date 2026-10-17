// Unit tests for the pure parts of the backend: `deno test supabase/functions/app/logic_test.ts`.
// Env vars are stubbed so importing lib.ts (which creates the Supabase client) works offline.
Deno.env.set("SUPABASE_URL", Deno.env.get("SUPABASE_URL") ?? "http://localhost:54321");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "test");

const { accessOf, calendarStatus, nextSchoolDay, pickLessons, schoolDays, weekParity } = await import("./core.ts");
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
