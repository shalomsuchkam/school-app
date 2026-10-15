// deno-lint-ignore-file no-explicit-any
import {
  accessOf, activeDay, applyAction, checkItem, childState, deleteFamily, dropOpenTasks, ensureTasks, getFamily, isDone, loadTasks, MAX_PHOTO, overview,
  purgePhotos, requestSkip, uploadPhoto,
} from "./core.ts";
import { LEGAL_VERSION, legalPage } from "./legal.ts";
import {
  clientIp, CORS, db, dow, esc, fmtLong, fmtShort, HM, HttpError, json, limit, localParts, randomCode, randomToken, safeEq, secret, sha256, toMin, validTz,
} from "./lib.ts";
import { notifyChild, notifyParents, tg, tgEnabled } from "./notify.ts";

type Device = { id: string; family_id: string; role: "parent" | "child"; name: string | null; tg_chat_id: number | null };

async function auth(req: Request): Promise<Device> {
  const h = req.headers.get("authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!token) throw new HttpError(401, "Нужен вход");
  const { data } = await db.from("app_devices").select("id, family_id, role, name, tg_chat_id, last_seen").eq("token_hash", await sha256(token)).maybeSingle();
  if (!data) throw new HttpError(401, "Устройство не найдено — войдите снова");
  // a token unused for half a year is retired: a lost or stolen phone does not keep access forever
  if (data.last_seen && Date.now() - new Date(data.last_seen).getTime() > 180 * 86400_000) {
    await db.from("app_devices").delete().eq("id", data.id);
    throw new HttpError(401, "Вход устарел — подключите устройство заново кодом");
  }
  db.from("app_devices").update({ last_seen: new Date().toISOString() }).eq("id", data.id).then(() => {});
  return data;
}
const parentOnly = (d: Device) => {
  if (d.role !== "parent") throw new HttpError(403, "Только для родителя");
};
async function body(req: Request) {
  return await req.json().catch(() => ({}));
}
const clean = (s: unknown, max = 40) => String(s ?? "").trim().slice(0, max);
const weekdays = (v: unknown) =>
  Array.isArray(v) ? [...new Set(v.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 7))].sort() : null;

async function newDevice(familyId: string, role: "parent" | "child", name: string) {
  const token = randomToken();
  const { data, error } = await db.from("app_devices")
    .insert({ family_id: familyId, role, name: name || null, token_hash: await sha256(token) }).select("id").single();
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
});

async function me(d: Device) {
  const fam = await getFamily(d.family_id);
  const { data: members } = await db.from("app_devices").select("id, role, name, tg_chat_id, created_at").eq("family_id", d.family_id).order("created_at");
  return {
    device: { id: d.id, role: d.role, name: d.name },
    family: publicFamily(fam),
    access: accessOf(fam, await billingOn()),
    members: (members ?? []).map((m: any) => ({ id: m.id, role: m.role, name: m.name, telegram: !!m.tg_chat_id, me: m.id === d.id })),
    telegram: { enabled: await tgEnabled(), bot: (await secret("app_bot_username")) || null, linked: !!d.tg_chat_id },
  };
}

async function setup(familyId: string) {
  const [{ data: subjects }, { data: lessons }, { data: items }, { data: off }] = await Promise.all([
    db.from("app_subjects").select("id, name, emoji, light").eq("family_id", familyId).order("name"),
    db.from("app_lessons").select("weekday, pos, subject_id").eq("family_id", familyId).order("weekday").order("pos"),
    db.from("app_items").select("id, title, emoji, required, needs_photo, weekdays, pos").eq("family_id", familyId).order("pos").order("id"),
    db.from("app_days_off").select("date").eq("family_id", familyId).order("date"),
  ]);
  const byDay: Record<string, number[]> = {};
  for (const l of lessons ?? []) (byDay[l.weekday] ??= []).push(l.subject_id);
  return { subjects: subjects ?? [], lessons: byDay, items: items ?? [], days_off: (off ?? []).map((o: any) => o.date) };
}

// ---------- Telegram bot (optional) ----------
async function parentDeviceByChat(chat: number) {
  const { data } = await db.from("app_devices").select("id, family_id, role").eq("tg_chat_id", chat).eq("role", "parent");
  return (data ?? []) as Device[];
}
async function statusText(fam: any) {
  const { S } = await activeDay(fam);
  await ensureTasks(fam, S);
  const tasks = await loadTasks(fam.id, S);
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
        const { data: dev } = await db.from("app_devices").select("family_id").eq("id", link.device_id).single();
        const fam = await getFamily(dev.family_id);
        return tg("sendMessage", {
          chat_id: m.chat.id, parse_mode: "HTML",
          text: `✅ <b>Telegram подключён.</b>\nСюда будут приходить фото, запросы на пропуск и тревоги по ${esc(fam.child_name)}.\n\n/status — что сделано сейчас`,
        });
      }
      return tg("sendMessage", { chat_id: m.chat.id, text: "Ссылка устарела. Откройте приложение → Настройки → Telegram и подключите заново." });
    }
  }
  const devs = await parentDeviceByChat(m.chat.id);
  if (!devs.length) return tg("sendMessage", { chat_id: m.chat.id, text: "Подключите Telegram в приложении: Настройки → Telegram." });
  if (text.startsWith("/status") || text === "📋 Статус") {
    for (const d of devs) await tg("sendMessage", { chat_id: m.chat.id, parse_mode: "HTML", text: await statusText(await getFamily(d.family_id)) });
  }
}

// ---------- reminders (cron, every 5 min) ----------
const RANK: Record<string, number> = { soft: 0, deadline: 1, final: 2 };
async function tick() {
  const { data: fams } = await db.from("app_families").select("*");
  let fired = 0;
  const hourly = new Date().getUTCMinutes() < 5;
  for (const fam of fams ?? []) {
    try {
      if (hourly) await purgePhotos(fam);
      const { now, S, due } = await activeDay(fam);
      if (due !== now.date) continue;
      await ensureTasks(fam, S);
      const tasks = await loadTasks(fam.id, S);
      const left = tasks.filter((t) => t.required && !isDone(t));
      if (!left.length) continue;
      const slots = [
        ...(fam.remind_times ?? []).map((t: string) => ({ t, kind: "soft" })),
        { t: fam.soft_deadline, kind: "deadline" },
        { t: fam.hard_deadline, kind: "final" },
      ].filter((x) => HM.test(x.t)).sort((a, b) => toMin(a.t) - toMin(b.t) || RANK[a.kind] - RANK[b.kind]);
      const nowM = toMin(now.hm);
      let slot: any = null;
      for (const x of slots.filter((x) => nowM >= toMin(x.t) && nowM - toMin(x.t) <= 30)) {
        // the kind is part of the key: a reminder at the same time as a deadline must not swallow the deadline alert
        const key = x.kind === "soft" ? x.t : `${x.kind}@${x.t}`;
        const { error } = await db.from("app_reminder_log").insert({ family_id: fam.id, school_date: S, slot: key });
        if (!error) slot = x;
      }
      if (!slot) continue;
      fired++;
      const names = left.map((t) => t.title).join(", ");
      const list = tasks.filter((t) => t.required).map((t) => `${isDone(t) ? "✅" : "⬜"} ${esc(t.emoji)} ${esc(t.title)}`).join("\n");
      if (slot.kind === "soft") {
        await notifyChild(fam.id, "📚 Пора за уроки", `Осталось: ${names}`);
      } else if (slot.kind === "deadline") {
        await notifyChild(fam.id, `⏰ ${fam.soft_deadline} — срок вышел`, `Не сделано: ${names}`);
        await notifyParents(fam.id, { title: `⏰ ${fam.soft_deadline}: не всё готово`, body: `Осталось: ${names}` },
          { html: `🚨 <b>${fam.soft_deadline} — ${esc(fam.child_name)}: не всё готово на ${esc(fmtShort(S))}</b>\n\n${list}\n\nПоследний срок — ${fam.hard_deadline}.` });
      } else {
        await notifyChild(fam.id, `🔴 ${fam.hard_deadline} — последний срок`, `Не сделано: ${names}`);
        await notifyParents(fam.id, { title: `🔴 ${fam.hard_deadline}: последний срок`, body: `Не сделано: ${names}` },
          { html: `🔴 <b>${fam.hard_deadline} — последний срок, не готово:</b>\n\n${list}` });
      }
    } catch (e) {
      console.error("tick family", fam.id, e);
    }
  }
  return { families: fams?.length ?? 0, fired };
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

  if (seg[0] === "legal" && M === "GET" && (seg[1] === "terms" || seg[1] === "privacy")) {
    return legalPage(seg[1], new URL(req.url).searchParams.get("lang") ?? "ru");
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
    const famId = String(ev.app_user_id ?? "");
    if (/^[0-9a-f-]{36}$/.test(famId)) await syncSubscription(famId);
    return json({ ok: true });
  }
  // Owner-only: free access for a family by its code (x-admin-key header).
  if (path === "/admin/grant" && M === "POST") {
    if (!safeEq(req.headers.get("x-admin-key"), await secret("app_admin_key"))) return json({ error: "forbidden" }, 403);
    const b = await body(req);
    const code = clean(b.code, 12).toUpperCase();
    const patch: any = b.revoke ? { free_forever: false, granted_until: null } : b.days ? { granted_until: new Date(Date.now() + Math.min(Number(b.days), 3650) * 86400_000).toISOString() } : { free_forever: true };
    const { data } = await db.from("app_families").update(patch).eq("code", code).select("code, child_name, free_forever, granted_until, paid_until");
    if (!data?.length) throw new HttpError(404, "Семья с таким кодом не найдена");
    return json(data[0]);
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
    return json({ ...(await newDevice(fam.id, "parent", clean(b.parent_name, 30))), role: "parent" });
  }
  if (path === "/join" && M === "POST") {
    await limit(`join:${clientIp(req)}`, 10, 900); // makes guessing 6-character codes pointless
    const b = await body(req);
    const code = clean(b.code, 12).toUpperCase().replace(/[^A-Z0-9]/g, "");
    // delete-and-return claims the code atomically: two phones can't both use one invite
    const { data: used } = await db.from("app_invites").delete().eq("code", code).gt("expires_at", new Date().toISOString()).select("*");
    const inv = used?.[0];
    if (!inv) throw new HttpError(404, "Код не найден или устарел");
    return json({ ...(await newDevice(inv.family_id, inv.role, clean(b.name, 30))), role: inv.role });
  }

  const d = await auth(req);
  const famId = d.family_id;

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

  // everything else needs an active subscription (or the owner's free access)
  const fam0 = await getFamily(famId);
  if (!accessOf(fam0, await billingOn()).active) throw new HttpError(402, d.role === "parent" ? "Подписка закончилась" : "Попроси родителя продлить подписку");

  if (path === "/setup" && M === "GET") return json(await setup(famId));

  // --- child ---
  if (seg[0] === "child") {
    const fam = fam0;
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
    const b = await body(req);
    if (path === "/child/skip" && M === "POST") {
      await requestSkip(fam, Number(b.task_id), clean(b.reason, 120) || "Не задали");
      return json({ ok: true });
    }
    if (path === "/child/check" && M === "POST") {
      await checkItem(fam, Number(b.task_id), !!b.done);
      return json({ ok: true });
    }
  }

  // --- everyone ---
  if (path === "/push" && M === "POST") {
    const b = await body(req);
    await db.from("app_devices").update({ push_token: clean(b.token, 200) || null }).eq("id", d.id);
    return json({ ok: true });
  }
  parentOnly(d);
  const fam = fam0;

  if (path === "/parent/overview" && M === "GET") return json(await overview(fam));
  if (path === "/parent/task" && M === "POST") {
    const b = await body(req);
    return json({ ok: true, text: await applyAction(fam, Number(b.id), String(b.action)) });
  }
  if (path === "/parent/nudge" && M === "POST") {
    const { S } = await activeDay(fam);
    const left = (await loadTasks(famId, S)).filter((t) => t.required && !isDone(t));
    const sent = left.length ? await notifyChild(famId, "📚 Напоминание от родителя", `Осталось: ${left.map((t) => t.title).join(", ")}`) : 0;
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
    if (Object.keys(patch).length) await db.from("app_families").update(patch).eq("id", famId);
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
    const { data: own } = await db.from("app_subjects").select("id").eq("family_id", famId).in("id", ids.length ? ids : [0]);
    const ok = new Set((own ?? []).map((s: any) => s.id));
    await db.from("app_lessons").delete().eq("family_id", famId).eq("weekday", wd);
    const rows = ids.filter((i) => ok.has(i)).map((subject_id, i) => ({ family_id: famId, weekday: wd, pos: i + 1, subject_id }));
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
      return o;
    };
    if (M === "POST" && seg.length === 1) {
      const f = fields(b);
      if (!f.title) throw new HttpError(400, "Название пустое");
      const { data } = await db.from("app_items").insert({ family_id: famId, ...f }).select("*").single();
      return json(data);
    }
    const id = Number(seg[1]);
    if (M === "PATCH") {
      await db.from("app_items").update(fields(b)).eq("id", id).eq("family_id", famId);
      return json({ ok: true });
    }
    if (M === "DELETE") {
      await db.from("app_items").delete().eq("id", id).eq("family_id", famId);
      await db.from("app_tasks").delete().eq("family_id", famId).eq("kind", "item").eq("ref_id", id).eq("status", "todo");
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
  if (path === "/invite" && M === "POST") {
    const b = await body(req);
    const role = b.role === "parent" ? "parent" : "child";
    const code = randomCode(6);
    const expires_at = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    await db.from("app_invites").delete().lt("expires_at", new Date().toISOString());
    const { error } = await db.from("app_invites").insert({ code, family_id: famId, role, expires_at });
    if (error) throw new HttpError(500, error.message);
    return json({ code, role, expires_at });
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
  try {
    if (path === "/" ) return json({ ok: true, service: "uroki-app" });
    return await route(req, path);
  } catch (e: any) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
