// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";

export const db: any = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const cache: Record<string, string> = {};
export async function secret(key: string): Promise<string> {
  if (cache[key]) return cache[key];
  const { data } = await db.from("app_secrets").select("value").eq("key", key).maybeSingle();
  const v = data?.value ?? "";
  if (v) cache[key] = v;
  return v;
}

export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};
export const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "content-type": "application/json" } });
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ---------- crypto / codes ----------
export async function sha256(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
export function randomToken() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function randomCode(n = 6) {
  const b = crypto.getRandomValues(new Uint8Array(n));
  return [...b].map((x) => ALPHA[x % ALPHA.length]).join("");
}

// ---------- time ----------
export function localParts(tz: string, d = new Date()) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const p: any = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}` };
}
export function addDays(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function dow(iso: string) {
  const w = new Date(iso + "T00:00:00Z").getUTCDay();
  return w === 0 ? 7 : w;
}
export const toMin = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
};
const WDS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const WDL = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"];
const MON = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
export const fmtShort = (iso: string) => `${WDS[dow(iso) - 1]}, ${+iso.slice(8)} ${MON[+iso.slice(5, 7) - 1].slice(0, 3)}`;
export const fmtLong = (iso: string) => `${WDL[dow(iso) - 1]}, ${+iso.slice(8)} ${MON[+iso.slice(5, 7) - 1]}`;
export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
