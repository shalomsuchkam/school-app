// Unit tests for the pure parts of the backend: `deno test supabase/functions/app/logic_test.ts`.
// Env vars are stubbed so importing lib.ts (which creates the Supabase client) works offline.
Deno.env.set("SUPABASE_URL", Deno.env.get("SUPABASE_URL") ?? "http://localhost:54321");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "test");

const { accessOf, nextSchoolDay, schoolDays, weekParity } = await import("./core.ts");
const { isHoliday, holidaysBetween } = await import("./holidays.ts");
const { tr } = await import("./i18n.ts");
const { addDays, dow, imageType, safeEq, validTz } = await import("./lib.ts");

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
