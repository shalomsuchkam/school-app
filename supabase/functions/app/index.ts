// deno-lint-ignore-file no-explicit-any
import {
  accessOf, activeDay, applyAction, checkItem, childState, clearOverride, deleteFamily, dropOpenTasks, ensureTasks, getFamily, isDone, listMessages, loadTasks,
  MAX_PHOTO, MAX_VOICE, monthCalendar, overview, children, kidOf, postMessage, purgePhotos, requestSkip, setNote, setOverride, startSession, uploadPhoto,
  uploadVoice, weeklyReport,
} from "./core.ts";
import { applyRange, groupRanges, parseRange } from "./daysoff.ts";
import { holidaysBetween } from "./holidays.ts";
import { langOf, tr } from "./i18n.ts";
import { inviteLang, invitePage } from "./invite.ts";
import { LEGAL_VERSION, legalPage } from "./legal.ts";
import {
  addDays, clientIp, CORS, db, dow, esc, fmtLong, fmtShort, HM, HttpError, inQuiet, json, limit, localParts, platformOf, randomCode, randomToken, safeEq, secret, sha256,
  toMin, validTz,
} from "./lib.ts";
import { notifyChild, notifyParents, tg, tgEnabled } from "./notify.ts";
import { createPromo, normPromo, redeemPromo } from "./promo.ts";
import { screenRoute } from "./screen.ts";
import { childLocation, parentLocations, parentTrail } from "./geo.ts";

// viewer = a tutor or teacher the family let in (allow_viewers): reads the parent's dashboards, changes nothing
type Role = "parent" | "child" | "viewer";
type Device = { id: string; family_id: string; role: Role; name: string | null; tg_chat_id: number | null; child_id: number | null };

async function auth(req: Request): Promise<Device> {
  const h = req.headers.get("authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!token) throw new HttpError(401, "Нужен вход");
  const { data } = await db.from("app_devices").select("id, family_id, role, name, tg_chat_id, last_seen, child_id").eq("token_hash", await sha256(token)).maybeSingle();
  if (!data) throw new HttpError(401, "Устройство не найдено — войдите снова");
  // a token unused for half a year is retired: a lost or stolen phone does not keep access forever
  if (data.last_seen && Date.now() - new Date(data.last_seen).getTime() > 180 * 86400_000) {
    await db.from("app_devices").delete().eq("id", data.id);
    throw new HttpError(401, "Вход устарел — подключите устройство заново кодом");
  }
  // the app sends its platform with every call (x-platform): devices that joined before it was stored get it too
  const platform = platformOf(req.headers.get("x-platform"));
  db.from("app_devices").update({ last_seen: new Date().toISOString(), ...(platform ? { platform } : null) }).eq("id", data.id).then(() => {});
  return data;
}
const parentOnly = (d: Device) => {
  if (d.role !== "parent") throw new HttpError(403, "Только для родителя");
};
// parents and viewers: the read-only dashboards
const readerOnly = (d: Device) => {
  if (d.role === "child") throw new HttpError(403, "Только для родителя");
};
// Everything a viewer device may call; the rest answers 403 before any handler runs.
const VIEWER_GET = new Set(["/me", "/setup", "/parent/overview", "/parent/report", "/parent/calendar", "/screen/rules", "/textbooks"]);
const viewerAllowed = (M: string, path: string, seg: string[]) =>
  (M === "GET" && (VIEWER_GET.has(path) || (seg[0] === "tasks" && seg[2] === "messages" && seg.length === 3))) ||
  (M === "DELETE" && path === "/members/me"); // leaving the family is always possible
// under /parent/ but family setup, not daily use: works without a subscription (like /dayoff)
const SETUP_PATHS = new Set(["/parent/days-off"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s: string) => DATE.test(s) && !isNaN(Date.parse(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;
async function body(req: Request) {
  return await req.json().catch(() => ({}));
}
const clean = (s: unknown, max = 40) => String(s ?? "").trim().slice(0, max);
const weekdays = (v: unknown) =>
  Array.isArray(v) ? [...new Set(v.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 7))].sort() : null;

async function newDevice(familyId: string, role: Role, name: string, childId: number | null = null, platform: string | null = null) {
  const token = randomToken();
  const { data, error } = await db.from("app_devices")
    .insert({
      family_id: familyId, role, name: name || null, token_hash: await sha256(token), child_id: role === "child" ? childId : null, ...(platform ? { platform } : null),
    }).select("id").single();
  if (error) throw new HttpError(500, error.message);
  return { token, device_id: data.id };
}

// Without a parent device nobody can invite, approve or change settings again, so the last one cannot be removed.
async function keepLastParent(familyId: string, deviceId: string) {
  const { data: dev } = await db.from("app_devices").select("role").eq("id", deviceId).eq("family_id", familyId).maybeSingle();
  if (dev?.role !== "parent") return;
  const { count } = await db.from("app_devices").select("id", { count: "exact", head: true }).eq("family_id", familyId).eq("role", "parent");
  if ((count ?? 0) <= 1) throw new HttpError(409, "Вы единственный родитель. Сначала пригласите второго родителя.");
}

const billingOn = async () => (await secret("app_billing_enabled")) === "1";
// Fields the client may see (subscription internals stay server-side).
const publicFamily = (f: any) => ({
  id: f.id, code: f.code, child_name: f.child_name, tz: f.tz, school_weekdays: f.school_weekdays, soft_deadline: f.soft_deadline,
  hard_deadline: f.hard_deadline, remind_times: f.remind_times, photo_retention_days: f.photo_retention_days, country: f.country, lang: f.lang,
  reward_goal: f.reward_goal ?? null, reward_text: f.reward_text ?? null, track_time: !!f.track_time, auto_holidays: f.auto_holidays !== false,
  quiet_from: f.quiet_from ?? null, quiet_to: f.quiet_to ?? null, allow_viewers: !!f.allow_viewers,
});

async function me(d: Device) {
  const fam = await getFamily(d.family_id);
  const { data: members } = await db.from("app_devices").select("id, role, name, tg_chat_id, created_at, child_id, last_seen, platform").eq("family_id", d.family_id).order("created_at");
  const kids = await children(d.family_id);
  return {
    device: { id: d.id, role: d.role, name: d.name, child_id: d.child_id },
    family: { ...publicFamily(fam), child_name: kids[0]?.name ?? fam.child_name },
    children: kids,
    access: accessOf(fam, await billingOn()),
    members: (members ?? []).map((m: any) => ({
      id: m.id, role: m.role, name: m.name, telegram: !!m.tg_chat_id, me: m.id === d.id, child_id: m.child_id,
      last_seen: m.last_seen ? new Date(m.last_seen).toISOString() : null, platform: m.platform ?? null,
    })),
    telegram: { enabled: await tgEnabled(), bot: (await secret("app_bot_username")) || null, linked: !!d.tg_chat_id },
  };
}

async function setup(fam: any) {
  const familyId = fam.id;
  const childId = fam.child_id;
  const today = localParts(fam.tz).date;
  const [{ data: subjects }, { data: lessons }, { data: items }, { data: off }, { data: ovs }] = await Promise.all([
    db.from("app_subjects").select("id, name, emoji, light").eq("family_id", familyId).order("name"),
    db.from("app_lessons").select("weekday, week_parity, pos, subject_id").eq("child_id", childId).order("weekday").order("pos"),
    db.from("app_items").select("id, title, emoji, required, needs_photo, weekdays, pos, child_id, category, duration_min").eq("family_id", familyId).order("pos").order("id"),
    // from a month back: the rows of past vacations pile up and the app only shows what is coming
    db.from("app_days_off").select("date, note").eq("family_id", familyId).gte("date", addDays(today, -30)).order("date").limit(1000),
    // one-day lesson overrides of this child for the next 30 days
    db.from("app_day_overrides").select("date, subject_ids, note").eq("child_id", childId).gte("date", today).lte("date", addDays(today, 30)).order("date"),
  ]);
  // lessons: every week; lessons_alt["1"|"2"]: odd/even ISO weeks (optional alternating timetable)
  const byDay: Record<string, number[]> = {};
  const alt: Record<string, Record<string, number[]>> = { "1": {}, "2": {} };
  for (const l of lessons ?? []) {
    const target = l.week_parity ? alt[String(l.week_parity)] : byDay;
    (target[l.weekday] ??= []).push(l.subject_id);
  }
  const end = new Date(Date.now() + 120 * 86400_000).toISOString().slice(0, 10);
  return {
    child_id: childId, subjects: subjects ?? [], lessons: byDay, lessons_alt: alt, items: items ?? [], days_off: (off ?? []).map((o: any) => o.date),
    // consecutive days off with the same name, the ones not over yet: {from, to, note, days}
    vacations: groupRanges(off ?? []).filter((r) => r.to >= today),
    holidays: fam.auto_holidays === false ? [] : holidaysBetween(fam.country ?? "KZ", today, end),
    overrides: (ovs ?? []).map((o: any) => ({ date: o.date, subject_ids: (o.subject_ids ?? []).map(Number), note: o.note ?? null })),
  };
}

// ---------- Telegram bot (optional) ----------
async function parentDeviceByChat(chat: number) {
  const { data } = await db.from("app_devices").select("id, family_id, role").eq("tg_chat_id", chat).eq("role", "parent");
  return (data ?? []) as Device[];
}
async function statusText(fam: any) {
  const { S } = await activeDay(fam);
  await ensureTasks(fam, S);
  const tasks = await loadTasks(fam, S);
  const req = tasks.filter((t) => t.required);
  const icon = (t: any) => (isDone(t) ? "✅" : t.status === "skip_pending" ? "⏳" : t.status === "redo" ? "🔄" : t.status === "skip_no" ? "❌" : "⬜");
  return `📋 <b>${esc(fam.child_name)} · ${esc(fmtLong(S))}</b>\nГотово: ${req.filter(isDone).length} из ${req.length}\n\n` +
    req.map((t) => `${icon(t)} ${esc(t.emoji)} ${esc(t.title)}`).join("\n");
}
async function handleTelegram(u: any) {
  if (u.callback_query) {
    const cb = u.callback_query;
    const devs = await parentDeviceByChat(cb.from?.id);
    const [kind, a, b] = String(cb.data).split(":");
    const taskId = Number(kind === "u" ? a : b);
    const { data: task } = await db.from("app_tasks").select("family_id, status, accepted").eq("id", taskId).maybeSingle();
    const dev = devs.find((d) => d.family_id === task?.family_id);
    if (!task || !dev) return tg("answerCallbackQuery", { callback_query_id: cb.id, text: "Нет доступа" });
    if (!accessOf(await getFamily(dev.family_id), await billingOn()).active) {
      return tg("answerCallbackQuery", { callback_query_id: cb.id, text: "Подписка закончилась" });
    }
    const closeKeyboard = () =>
      tg("editMessageReplyMarkup", { chat_id: cb.message.chat.id, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } });
    const expected = kind === "s" ? "skip_pending" : kind === "t" ? "done" : null;
    if ((expected && task.status !== expected) || (kind === "t" && a === "ok" && task.accepted)) {
      await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "Уже обработано" });
      return closeKeyboard();
    }
    const action = kind === "u" ? "undo" : kind === "t" ? (a === "ok" ? "ok" : "redo") : a === "ok" ? "skip_ok" : "skip_no";
    let text: string;
    try {
      // u:<id>:<action> undoes only that action; older u:<id> buttons undo whatever was last
      text = await applyAction(await getFamily(dev.family_id), taskId, action, kind === "u" ? b : undefined);
    } catch (e) {
      if (!(e instanceof HttpError)) throw e;
      await tg("answerCallbackQuery", { callback_query_id: cb.id, text: e.message });
      return closeKeyboard();
    }
    await tg("answerCallbackQuery", { callback_query_id: cb.id, text });
    await closeKeyboard();
    return tg("sendMessage", {
      chat_id: cb.message.chat.id, text, reply_to_message_id: cb.message.message_id,
      reply_markup: kind !== "u" ? { inline_keyboard: [[{ text: "↩️ Отменить", callback_data: `u:${taskId}:${action}` }]] } : undefined,
    });
  }
  const m = u.message;
  if (!m?.chat || m.chat.type !== "private") return;
  const text = String(m.text ?? "").trim();
  if (text.startsWith("/start")) {
    const code = text.split(/\s+/)[1];
    if (code) {
      const { data: link } = await db.from("app_tg_links").select("device_id, expires_at").eq("code", code).maybeSingle();
      if (link && new Date(link.expires_at) > new Date()) {
        await db.from("app_devices").update({ tg_chat_id: m.chat.id }).eq("id", link.device_id);
        await db.from("app_tg_links").delete().eq("code", code);
        return tg("sendMessage", {
          chat_id: m.chat.id, parse_mode: "HTML",
          text: `✅ <b>Telegram подключён.</b>\nСюда будут приходить фото, запросы на пропуск и тревоги по детям семьи.\n\n/status — что сделано сейчас`,
        });
      }
      return tg("sendMessage", { chat_id: m.chat.id, text: "Ссылка устарела. Откройте приложение → Настройки → Telegram и подключите заново." });
    }
  }
  const devs = await parentDeviceByChat(m.chat.id);
  if (!devs.length) return tg("sendMessage", { chat_id: m.chat.id, text: "Подключите Telegram в приложении: Настройки → Telegram." });
  if (text.startsWith("/status") || text === "📋 Статус") {
    for (const d of devs) {
      const fam = await getFamily(d.family_id);
      if (!accessOf(fam, await billingOn()).active) {
        await tg("sendMessage", { chat_id: m.chat.id, text: "Подписка закончилась — продлите её в приложении." });
        continue;
      }
      for (const c of await children(fam.id)) await tg("sendMessage", { chat_id: m.chat.id, parse_mode: "HTML", text: await statusText(await kidOf(fam, c.id)) });
    }
  }
}

// ---------- weekly report to Telegram: Sunday 19:00 family time ----------
async function weeklyTelegram(fam: any) {
  const now = localParts(fam.tz);
  if (dow(now.date) !== 7 || now.hm < "19:00" || now.hm > "19:30") return;
  const { error } = await db.from("app_reminder_log").insert({ family_id: fam.id, school_date: now.date, slot: "weekly" });
  if (error) return;
  for (const c of await children(fam.id)) await weeklyFor(await kidOf(fam, c.id));
}
async function weeklyFor(fam: any) {
  const r = await weeklyReport(fam);
  if (!r.totals.total) return;
  const worst = r.subjects.filter((s: any) => s.missed + s.late > 0).slice(0, 3).map((s: any) => `${esc(s.emoji)} ${esc(s.title)}: ${s.missed ? `пропущено ${s.missed}` : ""}${s.missed && s.late ? ", " : ""}${s.late ? `с опозданием ${s.late}` : ""}`);
  await notifyParents(fam.id, { title: "📊 Итоги недели", body: `Вовремя ${r.totals.on_time} из ${r.totals.total}` }, {
    html: `📊 <b>${esc(fam.child_name)}: итоги недели</b>\nВовремя: ${r.totals.on_time} из ${r.totals.total}\nС опозданием: ${r.totals.late} · Пропущено: ${r.totals.missed} · Освобождено: ${r.totals.skipped}\n🔥 Серия: ${r.streak}` +
      (worst.length ? `\n\nСтоит обратить внимание:\n${worst.join("\n")}` : "\n\nОтличная неделя! 🎉"),
  });
}

// ---------- reminders (cron, every 5 min) ----------
const RANK: Record<string, number> = { soft: 0, deadline: 1, final: 2 };
// Is any reminder/deadline slot of this family in the last 30 minutes (family time)? Cheap, in-memory:
// families outside every window cost no queries, so the 5-minute tick scales to thousands of families.
function inAlertWindow(fam: any) {
  const nowM = toMin(localParts(fam.tz).hm);
  return [...(fam.remind_times ?? []), fam.soft_deadline, fam.hard_deadline]
    .some((t: string) => HM.test(t ?? "") && nowM >= toMin(t) && nowM - toMin(t) <= 30);
}
async function tickFamily(fam: any, hourly: boolean, billing: boolean) {
  if (hourly) await purgePhotos(fam); // retention is kept even for lapsed families
  if (!accessOf(fam, billing).active) return 0;
  await weeklyTelegram(fam);
  if (!inAlertWindow(fam)) return 0;
  let fired = 0;
  for (const c of await children(fam.id)) fired += await tickChild(await kidOf(fam, c.id));
  return fired;
}
async function tick() {
  const hourly = new Date().getUTCMinutes() < 5;
  const billing = await billingOn();
  let fired = 0, total = 0;
  // PostgREST returns at most 1000 rows per request: read families page by page, 8 at a time in parallel
  for (let from = 0; ; from += 1000) {
    const { data: fams } = await db.from("app_families").select("*").order("id").range(from, from + 999);
    if (!fams?.length) break;
    total += fams.length;
    for (let i = 0; i < fams.length; i += 8) {
      const res = await Promise.all(fams.slice(i, i + 8).map((fam: any) =>
        tickFamily(fam, hourly, billing).catch((e) => (console.error("tick family", fam.id, e), 0))
      ));
      fired += res.reduce((a, b) => a + b, 0);
    }
    if (fams.length < 1000) break;
  }
  return { families: total, fired };
}

// One child's reminders for the due day; returns 1 when an alert fired.
async function tickChild(fam: any): Promise<number> {
  {
    {
      const { now, S, due } = await activeDay(fam);
      if (due !== now.date) return 0;
      await ensureTasks(fam, S);
      const tasks = await loadTasks(fam, S);
      const left = tasks.filter((t) => t.required && !isDone(t));
      if (!left.length) return 0;
      const slots = [
        ...(fam.remind_times ?? []).map((t: string) => ({ t, kind: "soft" })),
        { t: fam.soft_deadline, kind: "deadline" },
        { t: fam.hard_deadline, kind: "final" },
      ].filter((x) => HM.test(x.t)).sort((a, b) => toMin(a.t) - toMin(b.t) || RANK[a.kind] - RANK[b.kind]);
      const nowM = toMin(now.hm);
      let slot: any = null;
      for (const x of slots.filter((x) => nowM >= toMin(x.t) && nowM - toMin(x.t) <= 30)) {
        // the kind is part of the key: a reminder at the same time as a deadline must not swallow the deadline alert
        const key = `${x.kind === "soft" ? x.t : `${x.kind}@${x.t}`}#${fam.child_id}`;
        const { error } = await db.from("app_reminder_log").insert({ family_id: fam.id, school_date: S, slot: key });
        if (!error) slot = x;
      }
      if (!slot) return 0;
      const names = left.map((t) => t.title).join(", ");
      // quiet hours: the child's phone stays silent; deadline alerts still reach the parents
      const quiet = inQuiet(now.hm, fam.quiet_from, fam.quiet_to);
      const kidPush = (title: string, text: string) => (quiet ? Promise.resolve(0) : notifyChild(fam.id, fam.child_id, title, text));
      const list = tasks.filter((t) => t.required).map((t) => `${isDone(t) ? "✅" : "⬜"} ${esc(t.emoji)} ${esc(t.title)}`).join("\n");
      if (slot.kind === "soft") {
        await kidPush("📚 Пора за уроки", `Осталось: ${names}`);
      } else if (slot.kind === "deadline") {
        await kidPush(`⏰ ${fam.soft_deadline} — срок вышел`, `Не сделано: ${names}`);
        await notifyParents(fam.id, { title: `⏰ ${fam.soft_deadline}: не всё готово`, body: `Осталось: ${names}` },
          { html: `🚨 <b>${fam.soft_deadline} — ${esc(fam.child_name)}: не всё готово на ${esc(fmtShort(S))}</b>\n\n${list}\n\nПоследний срок — ${fam.hard_deadline}.` });
      } else {
        await kidPush(`🔴 ${fam.hard_deadline} — последний срок`, `Не сделано: ${names}`);
        await notifyParents(fam.id, { title: `🔴 ${fam.hard_deadline}: последний срок`, body: `Не сделано: ${names}` },
          { html: `🔴 <b>${fam.hard_deadline} — ${esc(fam.child_name)}: последний срок, не готово:</b>\n\n${list}` });
      }
      return 1;
    }
  }
}

// ---------- subscription sync ----------
// The truth comes from RevenueCat's REST API (which validates App Store / Google Play receipts), never from the client.
async function syncSubscription(famId: string) {
  const key = await secret("app_rc_api_key");
  if (!key) return;
  const r = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(famId)}`, { headers: { authorization: `Bearer ${key}` } });
  if (!r.ok) throw new HttpError(502, "Не удалось проверить подписку");
  const sub = (await r.json())?.subscriber ?? {};
  const ent = sub.entitlements?.pro;
  const subs = sub.subscriptions ?? {};
  const info = ent?.product_identifier ? subs[ent.product_identifier] : null;
  const until = !ent ? null : ent.expires_date ?? "2099-12-31T00:00:00Z";
  await db.from("app_families").update({
    paid_until: until, billing_store: info?.store ?? null, billing_period: info?.period_type ?? null,
  }).eq("id", famId);
}

// ---------- router ----------
async function route(req: Request, path: string): Promise<Response> {
  const seg = path.split("/").filter(Boolean);
  const M = req.method;

  if (seg[0] === "legal" && M === "GET" && (seg[1] === "terms" || seg[1] === "privacy" || seg[1] === "delete")) {
    return legalPage(seg[1], new URL(req.url).searchParams.get("lang") ?? langOf(req));
  }
  // invite link / QR code: a static page, the code is not looked up
  if (seg[0] === "i" && seg.length === 2 && M === "GET") {
    const u = new URL(req.url);
    return invitePage(seg[1], inviteLang(u.searchParams.get("lang"), req.headers.get("accept-language")), req.headers.get("user-agent"));
  }
  if (path === "/tg" && M === "POST") {
    if (!safeEq(req.headers.get("x-telegram-bot-api-secret-token"), await secret("app_tg_secret"))) return new Response("forbidden", { status: 403 });
    try { await handleTelegram(await req.json()); } catch (e) { console.error("tg", e); }
    return new Response("ok");
  }
  if (path === "/tick" && M === "POST") {
    if (!safeEq(req.headers.get("x-cron-key"), await secret("app_cron_key"))) return new Response("forbidden", { status: 403 });
    return json(await tick());
  }
  // RevenueCat webhook: purchases, renewals, cancellations, refunds -> family.paid_until
  if (path === "/billing/revenuecat" && M === "POST") {
    if (!safeEq(req.headers.get("authorization"), await secret("app_rc_webhook_auth"))) return new Response("forbidden", { status: 403 });
    const ev = (await body(req))?.event ?? {};
    // TRANSFER (a purchase restored under another family) has no app_user_id: re-check both sides
    const ids = new Set<string>([ev.app_user_id, ...(ev.transferred_from ?? []), ...(ev.transferred_to ?? [])].map((x) => String(x ?? "")));
    for (const famId of ids) if (/^[0-9a-f-]{36}$/.test(famId)) await syncSubscription(famId);
    return json({ ok: true });
  }
  // Owner-only: free access for a family by its code (x-admin-key header).
  if (path === "/admin/grant" && M === "POST") {
    if (!safeEq(req.headers.get("x-admin-key"), await secret("app_admin_key"))) return json({ error: "forbidden" }, 403);
    const b = await body(req);
    const code = clean(b.code, 12).toUpperCase();
    const days = Number(b.days);
    if (b.days !== undefined && !b.revoke && !(Number.isInteger(days) && days >= 1 && days <= 3650)) throw new HttpError(400, "days: 1–3650");
    const patch: any = b.revoke ? { free_forever: false, granted_until: null } : b.days ? { granted_until: new Date(Date.now() + days * 86400_000).toISOString() } : { free_forever: true };
    const { data } = await db.from("app_families").update(patch).eq("code", code).select("code, child_name, free_forever, granted_until, paid_until");
    if (!data?.length) throw new HttpError(404, "Семья с таким кодом не найдена");
    return json(data[0]);
  }
  // Owner-only: a promo code for free access {days? (null = forever), max_uses?, expires_at?, note?, code?}.
  // Without `code` a random one is made. Returns {code, ...}. The same from the server shell: deploy/lite/promo.sh.
  if (path === "/admin/promo" && M === "POST") {
    if (!safeEq(req.headers.get("x-admin-key"), await secret("app_admin_key"))) return json({ error: "forbidden" }, 403);
    return json(await createPromo(await body(req)));
  }
  if (path === "/setup-bot") {
    if (!safeEq(req.headers.get("x-cron-key"), await secret("app_cron_key"))) return json({ error: "forbidden" }, 403);
    const me = await tg("getMe", {});
    if (me?.result?.username) await db.from("app_secrets").upsert({ key: "app_bot_username", value: me.result.username });
    const wh = await tg("setWebhook", { url: `${await secret("app_fn_url")}/tg`, secret_token: await secret("app_tg_secret"), allowed_updates: ["message", "callback_query"] });
    await tg("setMyCommands", { commands: [{ command: "status", description: "Что сделано на завтра" }] });
    return json({ bot: me?.result?.username ?? null, webhook: wh });
  }

  // --- onboarding (no auth) ---
  if (path === "/family" && M === "POST") {
    await limit(`fam:${clientIp(req)}`, 5, 3600); // stops scripted family spam
    const b = await body(req);
    if (b.consent !== true) throw new HttpError(400, "Нужно принять соглашение и политику конфиденциальности");
    const tz = validTz(b.tz); // the parent's phone zone; unknown names keep the default
    const country = /^[A-Z]{2}$/.test(String(b.country ?? "")) ? b.country : "KZ";
    const lang = ["ru", "kk", "en"].includes(b.lang) ? b.lang : "ru";
    const { data: fam, error } = await db.from("app_families").insert({
      child_name: clean(b.child_name, 30) || "Ученик", country, lang, consent_at: new Date().toISOString(), consent_version: LEGAL_VERSION,
      ...(tz ? { tz } : {}),
    }).select("*").single();
    if (error) throw new HttpError(500, error.message);
    await db.from("app_children").insert({ family_id: fam.id, name: fam.child_name });
    return json({ ...(await newDevice(fam.id, "parent", clean(b.parent_name, 30), null, platformOf(b.platform))), role: "parent" });
  }
  if (path === "/join" && M === "POST") {
    await limit(`join:${clientIp(req)}`, 10, 900, true); // makes guessing 6-character codes pointless
    const b = await body(req);
    const code = clean(b.code, 12).toUpperCase().replace(/[^A-Z0-9]/g, "");
    // delete-and-return claims the code atomically: two phones can't both use one invite
    const { data: used } = await db.from("app_invites").delete().eq("code", code).gt("expires_at", new Date().toISOString()).select("*");
    const inv = used?.[0];
    if (!inv) {
      // service-wide cap on wrong codes: guessing stays hopeless even from many IP addresses
      await limit("join-fail", 300, 900, true);
      throw new HttpError(404, "Код не найден или устарел");
    }
    // a viewer invite stops working once the family turns viewers off
    if (inv.role === "viewer" && !(await getFamily(inv.family_id)).allow_viewers) throw new HttpError(404, "Код не найден или устарел");
    const childId = inv.role === "child" ? inv.child_id ?? (await children(inv.family_id))[0]?.id ?? null : null;
    // a child may join from several devices (phone, tablet): each gets its own row with the same child_id. A child's
    // device is named after its model ("Samsung SM-T220", "iPad") so the parent can tell them apart (the child's
    // name is already known); a parent's typed name comes first. The parent can rename any device.
    const name = inv.role === "child" ? clean(b.model, 30) || clean(b.name, 30) : clean(b.name, 30) || clean(b.model, 30);
    return json({ ...(await newDevice(inv.family_id, inv.role, name, childId, platformOf(b.platform))), role: inv.role });
  }

  const d = await auth(req);
  const famId = d.family_id;
  if (d.role === "viewer" && !viewerAllowed(M, path, seg)) throw new HttpError(403, "Только для родителя");

  // always available, even without a subscription: who am I, paywall refresh, leaving, deleting everything
  if (path === "/me" && M === "GET") return json(await me(d));
  if (path === "/billing/refresh" && M === "POST") {
    await limit(`bill:${famId}`, 20, 3600);
    await syncSubscription(famId);
    return json(accessOf(await getFamily(famId), await billingOn()));
  }
  if (path === "/members/me" && M === "DELETE") {
    if (d.role === "parent") await keepLastParent(famId, d.id);
    await db.from("app_devices").delete().eq("id", d.id);
    return json({ ok: true });
  }
  if (path === "/family" && M === "DELETE") {
    parentOnly(d);
    await deleteFamily(famId);
    return json({ ok: true });
  }
  // a promo code from the owner: exactly when the subscription has ended it must still work (answers like /billing/refresh)
  if (path === "/parent/promo" && M === "POST") {
    parentOnly(d);
    // guessing stays hopeless: per family, per address, and a service-wide cap on wrong codes
    await limit(`promo:${famId}`, 10, 3600, true);
    await limit(`promo-ip:${clientIp(req)}`, 20, 3600, true);
    const code = normPromo((await body(req)).code);
    try {
      if (!code) throw new HttpError(404, "Промокод не найден");
      await redeemPromo(famId, code);
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) await limit("promo-fail", 300, 3600, true);
      throw e;
    }
    return json(accessOf(await getFamily(famId), await billingOn()));
  }

  // Daily use (the child's tasks and actions, the parent's dashboard and approvals) needs an active subscription
  // or the owner's free access. Setting the family up (schedule, lists, invites, settings, textbook links) is always
  // possible, so a new family can finish onboarding and then start the store trial. Screen time is a daily feature.
  const fam0 = await getFamily(famId);
  const daily = (seg[0] === "child" || seg[0] === "parent" || seg[0] === "tasks" || seg[0] === "screen") && !SETUP_PATHS.has(path);
  if (daily && !accessOf(fam0, await billingOn()).active) {
    throw new HttpError(402, d.role !== "child" ? "Подписка закончилась" : "Попроси родителя продлить подписку");
  }

  // which child a request is about: the child's own device, or ?child=<id> from a parent (default: first child)
  const qChild = Number(new URL(req.url).searchParams.get("child")) || null;
  const kid = await kidOf(fam0, d.role === "child" ? d.child_id : qChild, M !== "GET");

  if (path === "/setup" && M === "GET") return json(await setup(kid));

  // screen time and textbook links (screen.ts, docs/SCREEN_TIME.md)
  if (seg[0] === "screen" || seg[0] === "textbooks") return await screenRoute(req, path, seg, d, fam0, qChild);

  // per-task chat between the child and the parents (viewers read only)
  if (seg[0] === "tasks" && seg[2] === "messages" && seg.length === 3) {
    const taskId = Number(seg[1]);
    if (M === "GET") return json(await listMessages(fam0, taskId, d));
    if (M === "POST") {
      if (d.role === "viewer") throw new HttpError(403, "Только для родителя");
      await limit(`msg:${d.id}`, 60, 3600);
      const b = await body(req);
      const text = typeof b.body === "string" ? b.body.trim() : "";
      return json(await postMessage(fam0, taskId, { id: d.id, child_id: d.child_id, role: d.role, name: d.name }, text));
    }
  }

  // --- child ---
  if (seg[0] === "child") {
    const fam = kid;
    if (path === "/child/state" && M === "GET") return json(await childState(fam));
    if (d.role !== "child") throw new HttpError(403, "Только для ученика");
    if (path === "/child/photo" && M === "POST") {
      await limit(`photo:${famId}`, 150, 86400);
      const ct = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      const qTask = new URL(req.url).searchParams.get("task_id");
      if (ct === "multipart/form-data") {
        // older app builds
        const fd = await req.formData();
        const file = fd.get("file");
        if (!(file instanceof File)) throw new HttpError(400, "Нет фото");
        await uploadPhoto(fam, Number(fd.get("task_id") ?? qTask), new Uint8Array(await file.arrayBuffer()));
      } else {
        // raw image body, task id in the query: POST /child/photo?task_id=…
        if (!ct.startsWith("image/") && ct !== "application/octet-stream") throw new HttpError(400, "Нет фото");
        if (Number(req.headers.get("content-length") ?? 0) > MAX_PHOTO) throw new HttpError(413, "Фото слишком большое");
        await uploadPhoto(fam, Number(qTask), new Uint8Array(await req.arrayBuffer()));
      }
      return json({ ok: true });
    }
    // raw audio body, task id in the query: POST /child/voice?task_id=…
    if (path === "/child/voice" && M === "POST") {
      const ct = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (!["audio/mp4", "audio/m4a", "audio/x-m4a", "audio/aac", "audio/mpeg"].includes(ct)) throw new HttpError(415, "Это не аудиозапись");
      if (Number(req.headers.get("content-length") ?? 0) > MAX_VOICE) throw new HttpError(413, "Запись слишком большая");
      await limit(`voice:${famId}`, 60, 86400);
      await uploadVoice(fam, Number(new URL(req.url).searchParams.get("task_id")), new Uint8Array(await req.arrayBuffer()));
      return json({ ok: true });
    }
    // one location ping from a child device (reads its own JSON body): geo.ts
    if (path === "/child/location" && M === "POST") return await childLocation(req, d, fam);
    const b = await body(req);
    if (path === "/child/skip" && M === "POST") {
      await requestSkip(fam, Number(b.task_id), clean(b.reason, 120) || "Не задали");
      return json({ ok: true });
    }
    if (path === "/child/check" && M === "POST") {
      await checkItem(fam, Number(b.task_id), !!b.done);
      return json({ ok: true });
    }
    if (path === "/child/note" && M === "POST") {
      await setNote(fam, Number(b.task_id), clean(b.note, 300), true);
      return json({ ok: true });
    }
    if (path === "/child/start" && M === "POST") return json({ started_at: await startSession(fam) });
  }

  // --- everyone ---
  if (path === "/push" && M === "POST") {
    const b = await body(req);
    await db.from("app_devices").update({ push_token: clean(b.token, 200) || null }).eq("id", d.id);
    return json({ ok: true });
  }
  // read-only dashboards: parents and viewers
  if (seg[0] === "parent" && M === "GET") {
    readerOnly(d);
    if (path === "/parent/overview") return json(await overview(kid));
    if (path === "/parent/report") return json(await weeklyReport(kid, Number(new URL(req.url).searchParams.get("days")) || 7));
    if (path === "/parent/calendar") {
      const month = new URL(req.url).searchParams.get("month") ?? localParts(kid.tz).date.slice(0, 7);
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new HttpError(400, "Неверный месяц");
      return json(await monthCalendar(kid, month));
    }
    // child location: latest point of every child, and the breadcrumb trail of one (geo.ts)
    if (path === "/parent/locations") return await parentLocations(kid);
    if (path === "/parent/location/trail") return await parentTrail(kid, qChild || kid.child_id);
  }

  parentOnly(d);
  const fam = fam0;

  // children: add, rename, remove (a family keeps at least one)
  if (path === "/children" && M === "POST") {
    const b = await body(req);
    const name = clean(b.name, 30);
    if (!name) throw new HttpError(400, "Название пустое");
    const list = await children(famId);
    if (list.length >= 8) throw new HttpError(400, "Не больше 8 учеников в семье");
    const { data, error } = await db.from("app_children").insert({ family_id: famId, name, pos: list.length }).select("id, name, pos").single();
    if (error) throw new HttpError(500, error.message);
    return json(data);
  }
  if (seg[0] === "children" && seg[1] && M === "PATCH") {
    const b = await body(req);
    const name = clean(b.name, 30);
    if (!name) throw new HttpError(400, "Название пустое");
    await db.from("app_children").update({ name }).eq("id", Number(seg[1])).eq("family_id", famId);
    const first = (await children(famId))[0];
    if (first?.id === Number(seg[1])) await db.from("app_families").update({ child_name: name }).eq("id", famId);
    return json({ ok: true });
  }
  if (seg[0] === "children" && seg[1] && M === "DELETE") {
    const list = await children(famId);
    if (list.length <= 1) throw new HttpError(409, "В семье должен остаться хотя бы один ученик");
    const id = Number(seg[1]);
    if (!list.some((c) => c.id === id)) throw new HttpError(404, "Ученик не найден");
    // photos and voice notes of this child's tasks go too
    const { data: ph } = await db.from("app_photos").select("path, app_tasks!inner(child_id)").eq("app_tasks.child_id", id);
    const { data: vs } = await db.from("app_tasks").select("voice_path").eq("family_id", famId).eq("child_id", id).not("voice_path", "is", null);
    const paths = [...(ph ?? []).map((r: any) => r.path), ...(vs ?? []).map((r: any) => r.voice_path)];
    for (let i = 0; i < paths.length; i += 100) await db.storage.from("app-photos").remove(paths.slice(i, i + 100));
    await db.from("app_children").delete().eq("id", id).eq("family_id", famId);
    return json({ ok: true });
  }

  // turn child location tracking on/off (geo.ts stores the point; the child phone starts/stops on its next /child/state)
  if (path === "/parent/track-location" && M === "POST") {
    const b = await body(req);
    const target = await kidOf(fam0, Number(b.child_id) || qChild, true);
    const on = b.on === true;
    await db.from("app_children").update({ track_location: on }).eq("id", target.child_id).eq("family_id", famId);
    if (!on) await db.from("app_locations").delete().eq("child_id", target.child_id);
    return json({ ok: true, tracking: on });
  }

  if (path === "/parent/task" && M === "POST") {
    const b = await body(req);
    const comment = typeof b.comment === "string" ? clean(b.comment, 300) : undefined;
    return json({ ok: true, text: tr(langOf(req), await applyAction(fam, Number(b.id), String(b.action), undefined, comment)) });
  }
  if (path === "/parent/note" && M === "POST") {
    const b = await body(req);
    await setNote(fam, Number(b.task_id), clean(b.note, 300), false);
    return json({ ok: true });
  }
  if (path === "/parent/nudge" && M === "POST") {
    const { S } = await activeDay(kid);
    const left = (await loadTasks(kid, S)).filter((t) => t.required && !isDone(t));
    const sent = left.length ? await notifyChild(famId, kid.child_id, "📚 Напоминание от родителя", `Осталось: ${left.map((t) => t.title).join(", ")}`) : 0;
    return json({ ok: true, sent, left: left.length });
  }

  if (path === "/family" && M === "PUT") {
    const b = await body(req);
    const patch: any = {};
    if (typeof b.child_name === "string" && b.child_name.trim()) patch.child_name = clean(b.child_name, 30);
    if (HM.test(b.soft_deadline)) patch.soft_deadline = b.soft_deadline;
    if (HM.test(b.hard_deadline)) patch.hard_deadline = b.hard_deadline;
    if (Array.isArray(b.remind_times) && b.remind_times.every((x: string) => HM.test(x))) patch.remind_times = [...new Set<string>(b.remind_times)].sort();
    const wd = weekdays(b.school_weekdays);
    if (wd && wd.length) patch.school_weekdays = wd;
    const tz = validTz(b.tz);
    if (tz) patch.tz = tz;
    const keep = Number(b.photo_retention_days);
    if (Number.isInteger(keep) && keep >= 7 && keep <= 40) patch.photo_retention_days = keep;
    if (["ru", "kk", "en"].includes(b.lang)) patch.lang = b.lang;
    if (/^[A-Z]{2}$/.test(String(b.country ?? ""))) patch.country = b.country;
    if (b.reward_goal === null) patch.reward_goal = null;
    else if (Number.isInteger(b.reward_goal) && b.reward_goal >= 1 && b.reward_goal <= 60) patch.reward_goal = b.reward_goal;
    if (typeof b.reward_text === "string") patch.reward_text = clean(b.reward_text, 80) || null;
    if (typeof b.track_time === "boolean") patch.track_time = b.track_time;
    if (typeof b.auto_holidays === "boolean") patch.auto_holidays = b.auto_holidays;
    // quiet hours: both times or neither (null clears); the window may cross midnight
    if (b.quiet_from !== undefined || b.quiet_to !== undefined) {
      if (b.quiet_from === null && b.quiet_to === null) Object.assign(patch, { quiet_from: null, quiet_to: null });
      else if (HM.test(b.quiet_from) && HM.test(b.quiet_to) && b.quiet_from !== b.quiet_to) Object.assign(patch, { quiet_from: b.quiet_from, quiet_to: b.quiet_to });
      else throw new HttpError(400, "Тихие часы: укажите начало и конец в формате ЧЧ:ММ");
    }
    if (typeof b.allow_viewers === "boolean") patch.allow_viewers = b.allow_viewers;
    if (Object.keys(patch).length) await db.from("app_families").update(patch).eq("id", famId);
    // turning viewers off disconnects every viewer phone and voids unused viewer codes
    if (patch.allow_viewers === false) {
      await db.from("app_devices").delete().eq("family_id", famId).eq("role", "viewer");
      await db.from("app_invites").delete().eq("family_id", famId).eq("role", "viewer");
    }
    if (patch.child_name) {
      const first = (await children(famId))[0];
      if (first) await db.from("app_children").update({ name: patch.child_name }).eq("id", first.id);
    }
    const nf = await getFamily(famId);
    // tasks already created for a weekday that is no longer a school day must not hang around as missed days
    if (patch.school_weekdays) await dropOpenTasks(famId, localParts(nf.tz).date, null, (date) => !nf.school_weekdays.includes(dow(date)));
    if (patch.photo_retention_days) await purgePhotos(nf);
    return json(publicFamily(nf));
  }

  // subjects
  if (seg[0] === "subjects") {
    const b = M === "DELETE" ? {} : await body(req);
    if (M === "POST" && seg.length === 1) {
      const name = clean(b.name, 40);
      if (!name) throw new HttpError(400, "Название пустое");
      const { data } = await db.from("app_subjects").insert({ family_id: famId, name, emoji: clean(b.emoji, 8) || "📘", light: !!b.light }).select("id, name, emoji, light").single();
      return json(data);
    }
    const id = Number(seg[1]);
    if (M === "PATCH") {
      const patch: any = {};
      if (b.name !== undefined) patch.name = clean(b.name, 40);
      if (b.emoji !== undefined) patch.emoji = clean(b.emoji, 8) || "📘";
      if (b.light !== undefined) patch.light = !!b.light;
      await db.from("app_subjects").update(patch).eq("id", id).eq("family_id", famId);
      return json({ ok: true });
    }
    if (M === "DELETE") {
      await db.from("app_subjects").delete().eq("id", id).eq("family_id", famId);
      return json({ ok: true });
    }
  }
  // lessons per weekday: PUT /lessons/3 {subject_ids:[…]}
  if (seg[0] === "lessons" && M === "PUT") {
    const wd = Number(seg[1]);
    if (!(wd >= 1 && wd <= 7)) throw new HttpError(400, "День недели 1–7");
    const b = await body(req);
    const ids: number[] = (Array.isArray(b.subject_ids) ? b.subject_ids : []).map(Number).slice(0, 14);
    const parity = [0, 1, 2].includes(Number(b.week_parity)) ? Number(b.week_parity) : 0;
    const { data: own } = await db.from("app_subjects").select("id").eq("family_id", famId).in("id", ids.length ? ids : [0]);
    const ok = new Set((own ?? []).map((s: any) => s.id));
    const cid = (await kidOf(fam0, Number(b.child_id) || qChild)).child_id;
    await db.from("app_lessons").delete().eq("child_id", cid).eq("weekday", wd).eq("week_parity", parity);
    const rows = ids.filter((i) => ok.has(i)).map((subject_id, i) => ({ family_id: famId, child_id: cid, weekday: wd, week_parity: parity, pos: i + 1, subject_id }));
    if (rows.length) await db.from("app_lessons").insert(rows);
    return json({ ok: true });
  }
  // checklist items
  if (seg[0] === "items") {
    const b = M === "DELETE" ? {} : await body(req);
    const fields = (x: any) => {
      const o: any = {};
      if (x.title !== undefined) o.title = clean(x.title, 50);
      if (x.emoji !== undefined) o.emoji = clean(x.emoji, 8) || "✅";
      if (x.required !== undefined) o.required = !!x.required;
      if (x.needs_photo !== undefined) o.needs_photo = !!x.needs_photo;
      if (x.weekdays !== undefined) { const w = weekdays(x.weekdays); o.weekdays = w && w.length ? w : null; }
      if (x.pos !== undefined) o.pos = Number(x.pos) || 0;
      if (x.child_id !== undefined) o.child_id = x.child_id ? Number(x.child_id) : null;
      // 'school' (homework, packing the bag) or 'home' (chores); optional expected minutes
      if (x.category !== undefined) {
        if (x.category !== "school" && x.category !== "home") throw new HttpError(400, "Неизвестная категория");
        o.category = x.category;
      }
      if (x.duration_min !== undefined) {
        const n = Number(x.duration_min);
        if (x.duration_min === null) o.duration_min = null;
        else if (Number.isInteger(n) && n >= 1 && n <= 240) o.duration_min = n;
        else throw new HttpError(400, "Длительность: от 1 до 240 минут");
      }
      return o;
    };
    if (M === "POST" && seg.length === 1) {
      const f = fields(b);
      if (!f.title) throw new HttpError(400, "Название пустое");
      if (f.child_id && !(await children(famId)).some((c) => c.id === f.child_id)) throw new HttpError(404, "Ученик не найден");
      const { data } = await db.from("app_items").insert({ family_id: famId, ...f }).select("*").single();
      return json(data);
    }
    const id = Number(seg[1]);
    if (M === "PATCH") {
      const f = fields(b);
      if (f.child_id && !(await children(famId)).some((c) => c.id === f.child_id)) throw new HttpError(404, "Ученик не найден");
      await db.from("app_items").update(f).eq("id", id).eq("family_id", famId);
      return json({ ok: true });
    }
    if (M === "DELETE") {
      await db.from("app_items").delete().eq("id", id).eq("family_id", famId);
      // open tasks of the item go too, unless the child recorded a voice note for them
      await db.from("app_tasks").delete().eq("family_id", famId).eq("kind", "item").eq("ref_id", id).eq("status", "todo").is("voice_path", null);
      return json({ ok: true });
    }
  }
  if (path === "/dayoff" && M === "POST") {
    const b = await body(req);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date)) throw new HttpError(400, "Неверная дата");
    if (b.off) {
      await db.from("app_days_off").upsert({ family_id: famId, date: b.date });
      await dropOpenTasks(famId, b.date, b.date, () => true);
    } else await db.from("app_days_off").delete().eq("family_id", famId).eq("date", b.date);
    return json({ ok: true });
  }
  // vacations: close (off: true) or reopen a range of dates at once {from, to, off, note?}; /dayoff stays for one day
  if (path === "/parent/days-off" && M === "POST") {
    await limit(`doff:${famId}`, 60, 3600);
    return json(await applyRange(famId, parseRange(await body(req), localParts(fam.tz).date)));
  }
  // one-day lesson override: PUT /overrides/2026-10-21 {child_id?, subject_ids:[…], note?}; DELETE /overrides/2026-10-21?child=…
  if (seg[0] === "overrides" && seg.length === 2 && (M === "PUT" || M === "DELETE")) {
    if (!validDate(seg[1])) throw new HttpError(400, "Неверная дата");
    if (M === "DELETE") {
      await clearOverride(kid, seg[1]);
      return json({ ok: true });
    }
    const b = await body(req);
    if (!Array.isArray(b.subject_ids)) throw new HttpError(400, "Нужен список предметов");
    const ids: number[] = [...new Set<number>(b.subject_ids.map(Number))];
    if (ids.some((i) => !Number.isInteger(i) || i <= 0)) throw new HttpError(404, "Предмет не найден");
    const target = await kidOf(fam0, Number(b.child_id) || qChild);
    return json(await setOverride(target, seg[1], ids, typeof b.note === "string" ? clean(b.note, 120) || null : null));
  }
  if (path === "/invite" && M === "POST") {
    await limit(`inv:${famId}`, 30, 3600);
    const b = await body(req);
    const role = b.role === "parent" ? "parent" : b.role === "viewer" ? "viewer" : "child";
    if (role === "viewer" && !fam.allow_viewers) throw new HttpError(403, "Сначала разрешите репетиторов в настройках семьи");
    const code = randomCode(6);
    const expires_at = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    await db.from("app_invites").delete().lt("expires_at", new Date().toISOString());
    const childId = role === "child" ? (await kidOf(fam0, Number(b.child_id) || null)).child_id : null;
    const { error } = await db.from("app_invites").insert({ code, family_id: famId, role, expires_at, child_id: childId });
    if (error) throw new HttpError(500, error.message);
    // the link opens the public /i/<code> page (also encoded in the QR code)
    const base = await secret("app_fn_url");
    return json({ code, role, expires_at, url: base ? `${base}/i/${code}` : null });
  }
  // rename a device of the family ("Планшет", "Телефон Алии"): PATCH /members/:id {name}
  if (seg[0] === "members" && M === "PATCH" && seg[1] && seg.length === 2) {
    const name = clean((await body(req)).name, 30);
    if (!name) throw new HttpError(400, "Название пустое");
    const { data } = await db.from("app_devices").update({ name }).eq("id", seg[1]).eq("family_id", famId).select("id");
    if (!data?.length) throw new HttpError(404, "Не найдено");
    return json({ ok: true });
  }
  if (seg[0] === "members" && M === "DELETE" && seg[1]) {
    await keepLastParent(famId, seg[1]);
    const { data: gone } = await db.from("app_devices").delete().eq("id", seg[1]).eq("family_id", famId).select("id");
    // a removed member must not come back with a code they have already seen
    if (gone?.length && seg[1] !== d.id) await db.from("app_invites").delete().eq("family_id", famId);
    return json({ ok: true });
  }
  if (path === "/telegram/link" && M === "POST") {
    if (!(await tgEnabled())) throw new HttpError(503, "Telegram пока не настроен");
    const code = randomCode(10);
    await db.from("app_tg_links").insert({ code, device_id: d.id, expires_at: new Date(Date.now() + 3600 * 1000).toISOString() });
    return json({ url: `https://t.me/${await secret("app_bot_username")}?start=${code}` });
  }
  if (path === "/telegram" && M === "DELETE") {
    await db.from("app_devices").update({ tg_chat_id: null }).eq("id", d.id);
    return json({ ok: true });
  }
  throw new HttpError(404, "Не найдено");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  const i = url.pathname.indexOf("/app");
  const path = (i >= 0 ? url.pathname.slice(i + 4) : url.pathname) || "/";
  let res: Response;
  try {
    res = path === "/" ? json({ ok: true, service: "uroki-app" }) : await route(req, path);
  } catch (e: any) {
    if (e instanceof HttpError && e.status !== 500) res = json({ error: tr(langOf(req), e.message) }, e.status);
    else {
      console.error(e);
      res = json({ error: "Ошибка сервера" }, 500); // no internals leak to clients
    }
  }
  // oldest app build the server still supports; older apps ask the user to update
  const minBuild = await secret("app_min_build").catch(() => "");
  if (minBuild) res.headers.set("x-min-build", minBuild);
  return res;
});
