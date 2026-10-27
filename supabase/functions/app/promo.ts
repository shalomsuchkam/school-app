// deno-lint-ignore-file no-explicit-any
// Promo codes: the owner creates them (POST /admin/promo, or deploy/lite/promo.sh on the server) and gives one to a
// family; a parent redeems it (POST /parent/promo). Redemption is one SQL function (app_promo_redeem,
// migration 20261027_promo_codes.sql): the code row is locked, so two phones can't both take the last use, and the
// (code, family) primary key stops a family from using one code twice.
import { db, HttpError } from "./lib.ts";

// A–Z and 2–9 without the look-alikes 0/O and 1/I (the same alphabet as invite codes); 6–16 characters.
export const PROMO_RE = /^[A-HJ-NP-Z2-9]{6,16}$/;

// What a person typed ("  zima-2026 ") → the stored form ("ZIMA2026"), or null when it can't be a code.
export function normPromo(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const c = v.toUpperCase().replace(/[\s\-_.]/g, "");
  return PROMO_RE.test(c) ? c : null;
}

export const PROMO_ERRORS: Record<string, [number, string]> = {
  not_found: [404, "Промокод не найден"],
  used: [409, "Промокод уже использован"],
  expired: [410, "Срок действия промокода истёк"],
};

// app_promo_redeem's status → nothing (ok) or the HttpError the parent sees.
export function promoOutcome(status: unknown) {
  if (status === "ok") return;
  const e = PROMO_ERRORS[String(status)];
  if (e) throw new HttpError(e[0], e[1]);
  throw new HttpError(500, `promo: unexpected status ${String(status)}`);
}

export async function redeemPromo(familyId: string, code: string) {
  const { data, error } = await db.rpc("app_promo_redeem", { p_code: code, p_family: familyId });
  if (error) throw new HttpError(500, error.message);
  promoOutcome(data);
}

// POST /admin/promo {days?, max_uses?, expires_at?, note?, code?}: validated input for app_promo_create.
export function parsePromoCreate(b: any) {
  const out: { p_days: number | null; p_max_uses: number; p_expires: string | null; p_note: string | null; p_code: string | null } = {
    p_days: null, p_max_uses: 1, p_expires: null, p_note: null, p_code: null,
  };
  if (b?.days !== undefined && b.days !== null) {
    const n = Number(b.days);
    if (!(Number.isInteger(n) && n >= 1 && n <= 3650)) throw new HttpError(400, "days: 1–3650 (or null = forever)");
    out.p_days = n;
  }
  if (b?.max_uses !== undefined && b.max_uses !== null) {
    const n = Number(b.max_uses);
    if (!(Number.isInteger(n) && n >= 1 && n <= 100000)) throw new HttpError(400, "max_uses: 1–100000");
    out.p_max_uses = n;
  }
  if (b?.expires_at !== undefined && b.expires_at !== null) {
    const t = Date.parse(String(b.expires_at));
    if (isNaN(t) || t <= Date.now()) throw new HttpError(400, "expires_at: a future date/time");
    out.p_expires = new Date(t).toISOString();
  }
  if (typeof b?.note === "string") out.p_note = b.note.trim().slice(0, 200) || null;
  if (b?.code !== undefined && b.code !== null) {
    const c = normPromo(b.code);
    if (!c) throw new HttpError(400, "code: 6–16 of A–Z, 2–9 (no 0, O, 1, I)");
    out.p_code = c;
  }
  return out;
}

export async function createPromo(b: any) {
  const args = parsePromoCreate(b);
  const { data, error } = await db.rpc("app_promo_create", args);
  if (error) {
    if (error.code === "23505") throw new HttpError(409, "code already exists");
    throw new HttpError(500, error.message);
  }
  return { code: String(data), days: args.p_days, max_uses: args.p_max_uses, expires_at: args.p_expires, note: args.p_note };
}
