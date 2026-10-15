// deno-lint-ignore-file no-explicit-any
import { db, secret } from "./lib.ts";

// ---------- Telegram (optional: only when a bot token is configured) ----------
export async function tgEnabled() {
  return !!(await secret("app_bot_token"));
}
export async function tg(method: string, body: any): Promise<any> {
  const token = await secret("app_bot_token");
  if (!token) return null;
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  return await r.json().catch(() => null);
}
async function tgPhoto(chat_id: number, bytes: Uint8Array<ArrayBuffer>, caption: string, reply_markup?: any) {
  const token = await secret("app_bot_token");
  if (!token) return;
  const fd = new FormData();
  fd.set("chat_id", String(chat_id));
  fd.set("caption", caption);
  fd.set("parse_mode", "HTML");
  if (reply_markup) fd.set("reply_markup", JSON.stringify(reply_markup));
  fd.set("photo", new Blob([bytes], { type: "image/jpeg" }), "photo.jpg");
  await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: "POST", body: fd }).catch(() => {});
}

// ---------- Expo push (works once the app has push credentials; silently skipped otherwise) ----------
async function expoPush(tokens: string[], title: string, body: string) {
  const to = tokens.filter((t) => t && t.startsWith("ExponentPushToken"));
  if (!to.length) return 0;
  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(to.map((t) => ({ to: t, title, body, sound: "default", priority: "high" }))),
  }).catch(() => {});
  return to.length;
}

async function devices(familyId: string, role: "parent" | "child") {
  const { data } = await db.from("app_devices").select("id, push_token, tg_chat_id, child_id").eq("family_id", familyId).eq("role", role);
  return (data ?? []) as { id: string; push_token: string | null; tg_chat_id: number | null; child_id: number | null }[];
}

export async function notifyParents(
  familyId: string,
  push: { title: string; body: string },
  telegram?: { html: string; markup?: any; photo?: Uint8Array<ArrayBuffer> },
) {
  const ds = await devices(familyId, "parent");
  await expoPush(ds.map((d) => d.push_token ?? ""), push.title, push.body);
  if (!telegram) return;
  for (const d of ds) {
    if (!d.tg_chat_id) continue;
    if (telegram.photo) await tgPhoto(d.tg_chat_id, telegram.photo, telegram.html, telegram.markup);
    else await tg("sendMessage", { chat_id: d.tg_chat_id, text: telegram.html, parse_mode: "HTML", reply_markup: telegram.markup });
  }
}

// childId limits the push to that child's phones (families can have several children).
export async function notifyChild(familyId: string, childId: number | null, title: string, body: string) {
  let ds = await devices(familyId, "child");
  if (childId) ds = ds.filter((d) => d.child_id === childId);
  return await expoPush(ds.map((d) => d.push_token ?? ""), title, body);
}
