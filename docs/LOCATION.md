# Child location — «Где ребёнок»

Open parental location, the way Family Link / Life360 do it: the child's phone reports where it is, the parent sees
it on a map, and the moment the child turns location off or revokes the permission the parent gets a push. This is
**not covert** — the child sees a persistent location icon and an in‑app notice, and is asked, in plain words, to
allow it.

## The Android ceiling (read this first)

A normal Play‑Store app **cannot be prevented** from the user turning the location master switch off, revoking the
permission, force‑stopping it or uninstalling it. That is Android's security model, not a code gap. True, truly
un‑bypassable enforcement needs **Device Owner / MDM provisioning** (the child's phone is factory‑reset and enrolled,
and the app becomes the device policy controller) — a separate, heavy mode we do not use here.

So the design is: **report whenever possible, and detect + alert instantly when it stops.**

- A foreground service keeps reporting after the app is swiped away (and `startOnBoot` resumes after a reboot).
- Every ping carries the phone's self‑reported state (`services_on`, `perm`), so a ping with no fix still tells the
  server the switch was turned off — and the server pushes the parent the moment that state changes.

## Pieces

| Layer | File | Role |
|---|---|---|
| DB | `supabase/migrations/20261029_child_location.sql` | `app_locations` (latest point + anti‑tamper state), `app_location_log` (bounded breadcrumb trail), `app_children.track_location` |
| Server | `supabase/functions/app/geo.ts` | `POST /child/location`, `GET /parent/locations`, `GET /parent/location/trail`, and the anti‑tamper notifications |
| Route wiring | `supabase/functions/app/index.ts`, `core.ts` | routes; `track_location` added to `/child/state` |
| Client API | `src/lib/api.ts` | `locations()`, `locationTrail()`, `setTrackLocation()` + types |
| Child tracker | `src/lib/geo.ts` | foreground‑service location updates + a heartbeat; reports fix and `services_on`/`perm` |
| Child UI | `src/components/GeoPanel.tsx` | asks permission, shows the open "location is on" notice, reconciles the tracker with the parent's setting |
| Parent UI | `src/app/parent/location.tsx` + `src/components/LocationMap.tsx` | map (Leaflet in a WebView), status line, breadcrumb, tracking toggle |
| Entry | `src/app/parent/settings.tsx`, `parent/_layout.tsx` | "Где ребёнок" row → `/parent/location` |

## Flow

1. Parent turns on **Где ребёнок → Отслеживать местоположение** (`POST /parent/track-location`).
2. The child phone picks `track_location` up on its next `/child/state`; `GeoPanel` asks for permission ("Allow all
   the time") and starts the foreground service (`src/lib/geo.ts`).
3. The phone posts pings to `POST /child/location`. The server keeps the latest point, trims the trail, and compares
   each ping with the previous one.
4. If `services_on` or `perm` flips to off/denied, `notifyParents` pushes the parent at once. The parent screen also
   shows an honest status line (`services_off` / `no_permission` / `stale` / `never`).

## Permissions / policy

- Android: `ACCESS_FINE/COARSE/BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`,
  `RECEIVE_BOOT_COMPLETED` (app.json). iOS background modes: `location`, `fetch`, `processing`.
- Google Play requires a visible foreground‑service notification while tracking (we show one) and a prominent
  disclosure + privacy‑policy entry for background location. **The privacy policy must state that the app collects
  precise location in the background for parental monitoring, and where it is stored** — update
  `supabase/functions/app/legal.ts` before submitting (it currently omits location).
- Background‑location access needs the Play Console "Location permissions" declaration + the demo video, since the
  feature is gated behind the parent's toggle.
