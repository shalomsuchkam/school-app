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
  "access-control-allow-headers": "content-type, authorization, x-lang",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};
export const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "content-type": "application/json" } });
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ---------- request guards ----------
// Constant-time comparison for shared secrets (cron key, webhook auth, admin key).
export function safeEq(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false;
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}
export const clientIp = (req: Request) => (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
// Fixed-window limiter backed by app_rate (atomic upsert in SQL). Fails open if the DB call errors.
export async function limit(key: string, max: number, windowSec: number) {
  const { data, error } = await db.rpc("app_rate_hit", { k: key, lim: max, win_sec: windowSec });
  if (!error && data === false) throw new HttpError(429, "Слишком много попыток. Попробуйте позже.");
}
// Magic-number check: only real JPEG/PNG/WebP files are stored as photos.
export function imageType(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return "image/webp";
  return null;
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
// Canonical IANA zone name, or null when the runtime does not know it (an unknown zone would break localParts).
export function validTz(v: unknown) {
  if (typeof v !== "string" || !v || v.length > 60) return null;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: v }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
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
