// deno-lint-ignore-file no-explicit-any
// Child location (docs/LOCATION.md). The phone reports its position on a background schedule (src/lib/geo.ts);
// the server keeps the latest point per device, a short breadcrumb trail, and — the anti-tamper part — compares
// every ping with the one before it so the parent is notified the instant a child turns location off or revokes
// the app's permission. The phone cannot be stopped by the OS from turning the master switch off, so detection +
// an immediate parent alert is the enforcement, exactly as Family Link / Life360 do it.
import { db, json, limit } from "./lib.ts";
import { notifyParents } from "./notify.ts";

type Dev = { id: string; family_id: string; role: string; name: string | null; child_id: number | null };

export type Perm = "always" | "while" | "denied" | "unknown";
const PERMS = new Set<Perm>(["always", "while", "denied", "unknown"]);

// how many recent points the breadcrumb trail keeps per child, and how far the phone must move (metres) before a
// new fix is added to the trail (the latest-point row is always refreshed)
const LOCATION_TRAIL = 200;
const TRAIL_MIN_MOVE_M = 25;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const inRange = (v: number | null, lo: number, hi: number) => v != null && v >= lo && v <= hi;

// metres between two lat/lng points (haversine); used to decide whether a fix is worth adding to the trail
function distM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000, toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad, dLng = (bLng - aLng) * toRad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// POST /child/location — one ping from a child device. kid = the family row with child_id/child_name.
export async function childLocation(req: Request, d: Dev, kid: any): Promise<Response> {
  // generous: a moving phone reports often, but never more than a few times a minute
  await limit(`loc:${d.id}`, 120, 120);
  const b = await req.json().catch(() => ({}));

  const lat = num(b.lat), lng = num(b.lng);
  const hasFix = inRange(lat, -90, 90) && inRange(lng, -180, 180);
  const perm: Perm = PERMS.has(b.perm) ? b.perm : "unknown";
  const services_on = b.services_on !== false; // default true: absence means "on"
  const accuracy = num(b.accuracy);
  const batteryN = num(b.battery);
  const battery = batteryN == null ? null : Math.max(0, Math.min(100, Math.round(batteryN)));
  const moving = b.moving === true;
  const fix_at = typeof b.at === "string" && !Number.isNaN(Date.parse(b.at)) ? new Date(b.at).toISOString() : null;

  // what we had before this ping — to detect a change in the master switch or the permission
  const { data: prev } = await db.from("app_locations").select("services_on, perm, lat, lng").eq("device_id", d.id).maybeSingle();

  await db.from("app_locations").upsert({
    device_id: d.id,
    family_id: kid.id,
    child_id: kid.child_id,
    lat: hasFix ? lat : (prev?.lat ?? null), // keep the last real point when a ping arrives with no fix
    lng: hasFix ? lng : (prev?.lng ?? null),
    accuracy: hasFix ? accuracy : null,
    battery,
    moving,
    services_on,
    perm,
    fix_at: hasFix ? (fix_at ?? new Date().toISOString()) : null,
    reported_at: new Date().toISOString(),
  }, { onConflict: "device_id" });

  // breadcrumb: add a point only when the child actually moved, then trim the trail to the newest LOCATION_TRAIL
  if (hasFix) {
    const moved = !prev?.lat || !prev?.lng || distM(prev.lat, prev.lng, lat!, lng!) >= TRAIL_MIN_MOVE_M;
    if (moved) {
      await db.from("app_location_log").insert({
        device_id: d.id, family_id: kid.id, child_id: kid.child_id, lat, lng, accuracy, fix_at: fix_at ?? new Date().toISOString(),
      });
      const { data: edge } = await db.from("app_location_log").select("id").eq("child_id", kid.child_id)
        .order("id", { ascending: false }).range(LOCATION_TRAIL, LOCATION_TRAIL);
      const cut = edge?.[0]?.id;
      if (cut) await db.from("app_location_log").delete().eq("child_id", kid.child_id).lt("id", cut);
    }
  }

  // --- anti-tamper notifications: only on a real change, so the parent is not spammed ---
  const name = kid.child_name || "Ребёнок";
  if (prev) {
    if (prev.services_on && !services_on) {
      await notifyParents(kid.id, { title: "📍 Геолокация выключена", body: `${name} выключил геолокацию на телефоне` });
    } else if (!prev.services_on && services_on) {
      await notifyParents(kid.id, { title: "✅ Геолокация включена", body: `${name} снова включил геолокацию` });
    }
    const hadAccess = prev.perm === "always" || prev.perm === "while";
    if (hadAccess && perm === "denied") {
      await notifyParents(kid.id, { title: "⚠️ Доступ к геолокации отключён", body: `${name} запретил приложению доступ к геолокации` });
    }
  }

  return json({ ok: true });
}

// A child's latest position for the parent dashboard. `stale` = no fresh ping for a while (phone off/offline or the
// child killed the app); combined with services_on/perm it tells the parent exactly why the dot is not moving.
export type ChildLocation = {
  child_id: number;
  name: string;
  tracking: boolean;      // the parent turned location tracking on for this child
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  battery: number | null;
  moving: boolean;
  services_on: boolean;
  perm: Perm;
  fix_at: string | null;
  reported_at: string | null;
  stale: boolean;         // older than STALE_MIN minutes
  status: "live" | "stale" | "services_off" | "no_permission" | "never";
};

const STALE_MIN = 20;

// GET /parent/locations (reader) — the newest point of every child in the family.
export async function parentLocations(kid: any): Promise<Response> {
  const { data: kids } = await db.from("app_children").select("id, name, pos, track_location").eq("family_id", kid.id).order("pos").order("id");
  const { data: rows } = await db.from("app_locations").select("*").eq("family_id", kid.id);
  const byChild = new Map<number, any>();
  for (const r of rows ?? []) {
    // a child may have several devices: keep the one that reported most recently
    const cur = byChild.get(r.child_id);
    if (!cur || new Date(r.reported_at).getTime() > new Date(cur.reported_at).getTime()) byChild.set(r.child_id, r);
  }
  const now = Date.now();
  const out: ChildLocation[] = (kids ?? []).map((c: any) => {
    const r = byChild.get(c.id);
    if (!r) {
      return { child_id: c.id, name: c.name, tracking: !!c.track_location, lat: null, lng: null, accuracy: null, battery: null, moving: false, services_on: false, perm: "unknown", fix_at: null, reported_at: null, stale: true, status: "never" };
    }
    const stale = !r.reported_at || now - new Date(r.reported_at).getTime() > STALE_MIN * 60_000;
    const status: ChildLocation["status"] = r.perm === "denied" ? "no_permission" : !r.services_on ? "services_off" : stale ? "stale" : "live";
    return {
      child_id: c.id, name: c.name, tracking: !!c.track_location, lat: r.lat, lng: r.lng, accuracy: r.accuracy, battery: r.battery, moving: r.moving,
      services_on: r.services_on, perm: r.perm, fix_at: r.fix_at, reported_at: r.reported_at, stale, status,
    };
  });
  return json({ children: out, tz: kid.tz, now: new Date().toISOString() });
}

// GET /parent/location/trail?child=<id> (reader) — the recent breadcrumb for one child.
export async function parentTrail(kid: any, childId: number): Promise<Response> {
  const { data } = await db.from("app_location_log").select("lat, lng, accuracy, fix_at, created_at")
    .eq("family_id", kid.id).eq("child_id", childId).order("id", { ascending: false }).limit(LOCATION_TRAIL);
  return json({ trail: (data ?? []).reverse() });
}
