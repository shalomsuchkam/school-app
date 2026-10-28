# Screen time & textbooks — shared contract (v1)

Parental controls for the child's phone, configured by the parent in «Уроки». Android is enforced by the
native module `modules/screen-guard` (UsageStats + foreground service with a visible notification + full-screen block screen). There is no
anti-uninstall (no device admin): if the child removes «Уроки» or turns a permission off, the reports stop or show it and
the parent sees «Защита выключена» in the app.
iOS uses Apple's Screen Time API (FamilyControls/ManagedSettings/DeviceActivity, see "iOS" below), behind the
`iosScreenTime` build flag that stays off until Apple grants the Family Controls (Distribution) entitlement; until
then iOS shows the rules but does not enforce them.

## Rules object (per child) — `ScreenRules`

```jsonc
{
  "child_id": 12,
  "enabled": true,                       // master switch
  "daily_limit_min": 120,                // null = no overall limit (whole phone, minus always-allowed apps)
  "app_limits": [{ "pkg": "com.zhiliaoapp.musically", "name": "TikTok", "minutes": 30 }],
  "blocked_apps": ["com.example.game"],  // never allowed
  "always_allowed": ["kz.uroki.app", "com.android.dialer", "com.whatsapp"], // never blocked (calls, Уроки…)
  "bedtime": { "from": "21:30", "to": "07:00", "allowed": ["com.android.dialer"] },        // null = off
  "school":  { "from": "08:00", "to": "14:00", "days": [1,2,3,4,5], "allowed": [] },        // null = off
  "homework_lock": true,                 // until today's required tasks are done only always_allowed + textbooks
  "homework_lock_from": "15:00",         // the lock starts at this time on the evening homework is due
  "block_new_apps": true,                // a newly installed app is blocked until a parent approves it
  "unlock_until": "2026-10-22T18:30:00Z",// parent's temporary unlock (bonus time); null = none
  "updated_at": "2026-10-22T10:00:00Z"
}
```

Times are HH:MM in the family time zone (`tz` of the family); windows may cross midnight. `days` are ISO weekdays
1..7. Package names are Android package names; iOS ignores them.

Clarifications (server v1, migration `20261022_screen_time.sql`):
- A window is `[from, to)`: `from` is inside, `to` is not; `from > to` crosses midnight (21:30–07:00). `from = to` is
  rejected by `PUT /screen/rules`. `school.days` defaults to `[1,2,3,4,5]` and is never empty; for a school window that
  crosses midnight the weekday is that of the current local date. `allowed` lists default to `[]`.
- `app_limits[].name` defaults to the package name; at most one entry per package (the last one wins).
- `unlock_until` and `updated_at` are read-only in `PUT /screen/rules` (use `POST /screen/unlock`); `child_id` in the body
  only selects the child.

## Decision order (same logic on server tests and in Kotlin)

Reference implementation: `screenDecision(rules, ctx)` in `supabase/functions/app/screen.ts`, tested in `logic_test.ts`
(Kotlin mirrors those cases). It returns `{ allow: boolean, reason: null | "blocked" | "new_app" | "bedtime" | "school" |
"homework" | "app_limit" | "daily_limit" }`. `ctx`:

| field | meaning / where the guard gets it |
|---|---|
| `pkg` | foreground package |
| `nowLocalHM`, `isoWeekday` | current HH:MM and ISO weekday (1..7) in the family `tz` |
| `isSchoolDay` | today (family-local) is a school day: a school weekday, not a day off, not a public holiday — `school_day` from the server (step 7) |
| `homeworkDone` | `homework_done` from the server |
| `homeworkDueToday` | the next school day's homework is due this evening — `homework_due_today` from the server (step 8) |
| `usageApp`, `usageTotal` | today's minutes of this app / of all apps except the step-2 apps (`countedTotal`), **on all of the child's devices**: this phone's own minutes plus `usage_other_devices` (see "Several devices") |
| `isNew`, `approved` | `isNew = !approved = pkg ∈ new_apps` from the server; an app installed since the last report: `isNew = true`, `approved = false` (report right away on PACKAGE_ADDED) |
| `nowUtc` | current time (ISO string, ms or Date) |
| `setupOpen?` | the guard's own setup screen is open (allows `com.android.settings`) |
| `isSystem?` | the phone resolved `pkg` as its default home, dialer or SMS app |

The static step-2 list is `SYSTEM_PACKAGES` in `screen.ts` («Уроки», `android`, system UI, common launchers, dialers,
contacts, SMS, emergency apps). Steps 6 and 7 are final: an app in the window's `allowed` list is allowed there (steps
8–10 are not checked for it), every other non-step-2 app is blocked.

1. `enabled = false` → allow everything.
2. App is «Уроки» itself (`kz.uroki.app`), the launcher/home, system UI, phone/dialer, SMS, settings needed for
   emergency (`com.android.settings` only while the guard setup screen is open), or in `always_allowed` → allow.
3. `unlock_until` in the future → allow.
4. In `blocked_apps` → block (`reason: "blocked"`).
5. App installed after rules were enabled, not approved, and `block_new_apps` → block (`"new_app"`).
6. Inside `bedtime` window → allow only `bedtime.allowed` (+ step 2) → else block (`"bedtime"`).
7. Inside `school` window on a listed day that is a school day (`school_day`: not a holiday or day off) → allow only `school.allowed` (+ step 2) → else block (`"school"`).
8. `homework_lock` and now ≥ `homework_lock_from` on the evening the homework is due (`homework_due_today`: today is
   the day before the next school day — Sunday before Monday yes, Friday before Monday no) and that homework not done
   → block (`"homework"`).
9. App has an `app_limits` entry and today's usage of it (all the child's devices) ≥ minutes → block (`"app_limit"`).
10. `daily_limit_min` set and today's total usage (all apps except step-2 apps, all the child's devices) ≥ limit → block (`"daily_limit"`).
11. Otherwise allow.

Textbooks are opened inside «Уроки» (in-app viewer), so they stay available whenever «Уроки» is allowed.

## Several devices of one child (phone + tablet)

A child may use several devices: every child invite (`POST /invite {role:"child", child_id}`) that is redeemed adds an
`app_devices` row with that `child_id` (parent UI: Settings → «Устройства ребёнка» → «Добавить устройство ребёнка»).
Rules are per child, so every device gets the same rules; each Android device runs its own guard and sends its own
report (`app_screen_reports` keeps one row per device).

**Limits are shared across all of the child's devices.** The server answers a child device (`GET /screen/rules` and
`POST /screen/report`) with

```jsonc
"usage_other_devices": { "date": "2026-10-27", "total_min": 35, "apps": { "com.zhiliaoapp.musically": 20 } }
```

today's usage summed from the latest reports of the child's **other** devices (`otherDevicesUsage()` in `screen.ts`):
only reports whose `usage.date` is today's family-local date count; `apps` adds the minutes per package (step 9) and
`total_min` adds each device's own `total_min` (step 10; every device leaves out its own step-2 apps, e.g. its launcher,
before reporting); each value ≤ 1440. A device's own report stays its own usage only (never the sum), so nothing is
counted twice. The guard uses it only while `date` is today (family tz) and adds it to its local usage: `usageApp` =
own + `apps[pkg]`, `usageTotal` = own counted total + `total_min` (Kotlin: `DecisionInput.otherUsageMin` /
`otherTotalMin`, `appMinutes()`, `countedMinutes()`). The child's «осталось сегодня» card adds it the same way.

Usage from the other devices arrives with **up to ~5 minutes of delay** (each guard reports every 5 minutes and picks the
others' minutes up with its own next report), so a limit can be overshot by a few minutes when the child switches devices.
On iPhone/iPad Apple gives no usage numbers: an iOS device neither reports usage nor adds the others', so limits there
count that device only (see "iOS"); bedtime, school, homework lock and blocks apply on every device.

Everything else is per child, not per device: tasks, streaks, chat (a child's messages show the child's name and are
"mine" on each of the child's devices), photos, voice notes and homework status; push notifications go to all the
child's devices; the parent's "last seen" of a child is its most recently active device.

## Endpoints (edge function `app`)

- `GET /screen/rules?child=ID` — parent/viewer (any child of the family) or the child device (own child).
  → `{ rules: ScreenRules, homework_done: boolean, homework_date: "YYYY-MM-DD", tz: "Asia/Almaty",
       textbooks: Textbook[], device: DeviceReport | null, devices: DeviceReport[],
       homework_due_today: boolean, today: "YYYY-MM-DD", school_day: boolean, approved: string[], new_apps: string[], lang: "ru" | "kk" | "en" }`
  Defaults when no row exists: `enabled:false`, everything else null/empty, `homework_lock_from:"15:00"`.
  `homework_date` is the child's next school day (the `school_date` of `/child/state`); `homework_done` = every
  required task of that day is `done` or `skip_ok` (true when there are none). `homework_due_today`: today is
  the evening that homework is due (`homework_date` − 1 day, as for the reminders; ctx `homeworkDueToday`). `today`/`school_day`: family-local date
  and whether it is a school day (ctx `isSchoolDay`). `new_apps`: packages blocked as new until a parent approves them;
  `approved`: this child's reported packages that are not new or were approved (same as `device.approved`);
  `lang`: the family language (for the block screen texts). `devices`: every device of the child that has reported,
  newest first (`device` = `devices[0]`, kept for older apps). A child device also gets `usage_other_devices` (see
  "Several devices").
  A child device always gets its own child (`?child` is ignored); a parent's unknown `child` id is 404.
- `PUT /screen/rules` — parent only. Body: partial `ScreenRules` + `child_id`. Validates HH:MM, minutes 1..1440,
  ≤ 200 package names (each ≤ 200 chars, `^[A-Za-z0-9._]+$`), app_limits ≤ 100. Returns the full rules.
  Omitted fields keep their value; `null` clears `daily_limit_min`, `bedtime`, `school`. Invalid input → 400.
- `POST /screen/unlock` — parent only. `{ child_id, minutes }` (1..240) → sets `unlock_until = now + minutes`;
  `{ child_id, minutes: 0 }` cancels. Pushes the child: «Родитель дал N минут». Returns the full rules.
- `POST /screen/report` — child device only. Body:
  `{ apps: [{ pkg, name, installed_at? }], usage: { date: "YYYY-MM-DD", total_min, apps: { [pkg]: minutes } },
     guard: { usage_access, overlay, battery_ok, running } }`
  Stores the latest report per child device (≤ 500 apps, names ≤ 80 chars). If `block_new_apps` and the report has
  packages not seen before → notify parents «Новое приложение: <name>» (once per package).
  → `{ ok: true, rules: ScreenRules, homework_done, homework_date, homework_due_today, tz, approved, lang, today, school_day, new_apps, usage_other_devices }`
  (so the guard refreshes fully from this one call; the fields mean the same as in `GET /screen/rules`). Stored even when the child has no rules yet. Bad entries (invalid package,
  duplicates) are dropped, names cut to 80 chars, minutes clamped to 0..1440; > 500 apps → 400. `installed_at` is an
  ISO string or epoch ms. A package is "new" when it was not reported before, `enabled` and `block_new_apps` are on,
  no rule covers it yet (step 2, blocked, app limit) and it was installed after the rules were switched on
  (`installed_at`), or — without `installed_at` — it is not in the child's first report (the baseline). Limit: 120
  reports per device per hour.
- `POST /screen/approve` — parent only. `{ child_id, pkg, action: "allow" | "block" | "limit", minutes? }` —
  adds to `always_allowed` / `blocked_apps` / `app_limits`, and marks the package approved (no longer "new").
  `allow` also removes it from `blocked_apps`; `block` from `always_allowed`; `limit` (minutes 1..1440) replaces its
  limit and removes it from both lists. Returns the full rules.
- `DeviceReport` (in GET /screen/rules): `{ device_id, apps, usage, guard, reported_at, approved: string[], name, platform,
  last_seen }` — one device's latest report; `approved` = reported packages that are not new (or were approved);
  `name`/`platform` (`"android" | "ios" | "web" | null`)/`last_seen` describe the device, so the parent sees a guard card
  per device («Защита выключена», «нет связи» each).
- `GET /textbooks?child=ID` / `POST /textbooks { child_id|null, title, url }` / `DELETE /textbooks/:id` — parent
  manages links (http/https only, ≤ 500 chars, title ≤ 80). Child reads its own (child_id = own or null).
  `Textbook = { id, child_id: number | null, title, url, created_at }`. A parent/viewer without `?child` gets all of
  the family's links. ≤ 100 per family. POST returns the created textbook, DELETE `{ ok: true }`.
  PDFs are never uploaded: the child's phone keeps local PDFs in app storage (picked from Files/Downloads), so the
  server stores nothing for them.

Access and limits: parents do everything; viewers only `GET /screen/rules` and `GET /textbooks`; the child device
`GET /screen/rules`, `POST /screen/report`, `GET /textbooks`. `/screen/*` is a daily feature: with a lapsed subscription
it answers 402 like `/child/*` and `/parent/*` — **the guard must then stop blocking** (treat as `enabled:false`) so
a lapsed payment never locks the child's phone. Textbook links are setup and always available. Rate limits: 300
rule/unlock/approve changes per family per hour, 60 new textbooks per family per hour. All data is deleted with the
child, the device (its report) or the family.

## Native module API (`modules/screen-guard`, Android; iOS/web stubs return `supported:false`)

```ts
status(): Promise<{ supported, usage_access, overlay, battery_ok, running, configured }>
openUsageAccessSettings(): Promise<void>; openOverlaySettings(): Promise<void>
openBatterySettings(): Promise<void>
start(config: { apiBase, token, childId }): Promise<void>  // foreground service: polls rules, reports usage
stop(): Promise<void>
setRules(snapshot: { rules: ScreenRules, homework_done: boolean, tz: string }): Promise<void> // immediate refresh
installedApps(): Promise<{ pkg, name }[]>; usageToday(): Promise<{ total_min, apps: Record<string, number> }>
```
The service keeps working when the app is closed (foreground service with a persistent notification
«Уроки: родительский контроль включён»), restarts after reboot, re-evaluates the foreground app every ~1 s and
shows a full-screen block screen with the reason and buttons «Открыть Уроки» / «Домой».

## iOS (Apple Screen Time, behind the `iosScreenTime` flag)

Library: `react-native-device-activity` 0.6.1 (Expo module, new architecture). Logic: `src/lib/screenGuardIos.ts`
(pure `planIos()` is unit-tested in `__tests__/screenGuardIos.test.ts`); UI: `src/components/screen/IosScreenTime.tsx`.

**Flag.** `expo.extra.iosScreenTime` in app.json (default `false`) or `EXPO_PUBLIC_IOS_SCREEN_TIME=1`. When on,
`app.config.ts` adds the library's config plugin: Family Controls + App Group `group.kz.uroki.app` entitlements for the
app, and three app extensions built from `./targets` (copies of the package's sources; deployment target 16.4):

| Extension | Bundle ID |
|---|---|
| DeviceActivityMonitor (runs the schedules and thresholds while «Уроки» is closed) | `kz.uroki.app.ActivityMonitorExtension` |
| ShieldConfiguration (the «Сейчас нельзя» screen, texts written by the app) | `kz.uroki.app.ShieldConfiguration` |
| ShieldAction (shield button: closes the shield) | `kz.uroki.app.ShieldAction` |

When off: no plugin, no extensions, no entitlement; the child sees the old «скоро на iPhone» card. The
`react-native-device-activity` pod and the local `modules/app-lock-ios` pod are autolinked in every iOS build (Expo
autolinking cannot be switched by app config) but stay inert: nothing calls them while the flag is off.

**Model.** Apple gives no package names and no usage numbers. With several devices, limits on an iPhone/iPad count
that device only (its usage is never reported, and it does not add `usage_other_devices`); shields and schedules
(bedtime, school, homework lock) still apply on every device. The child's iPhone asks
`AuthorizationCenter.requestAuthorization(for: .child)` (the child must be in the parent's Family Sharing; the parent
confirms with their Apple ID). The parent, holding the child's phone, picks three selections with Apple's
FamilyActivityPicker; they are stored on the device only:
- `uroki_always` «Всегда разрешены» (must include «Уроки» itself, else a shield could lock the child out of homework);
- `uroki_limited` «С лимитом»;
- `uroki_window` «Разрешены во время сна/школы» (one selection for both windows).

Usage is visible only on the device (Settings → Screen Time). The parent screen shows an «iPhone» card while no
Android report exists.

**Rules → device** (recomputed on every rules fetch, app foreground and the 5-minute poll; the extension runs the
transitions in between):

| Rule | iOS |
|---|---|
| `enabled:false` or 402 | everything cleared (schedules stopped, shields off, ManagedSettings stores cleared) |
| `bedtime` | daily DeviceActivity schedule; start = shield everything except `always` + `window` ("block-all mode" + whitelist), end = shield off |
| `school` | one weekly schedule per listed weekday, same shield; on a non-school day (`school_day:false`) today's run is skipped (`neverTriggerBefore` = tomorrow). Future holidays are not known in advance: a holiday is skipped only if «Уроки» refreshed that day |
| homework lock | when `homework_lock && homework_due_today && !homework_done`: a dated one-off schedule from `homework_lock_from` to 23:59 (or to bedtime start if bedtime begins later that evening), shield everything except `always`; applied at once if already past the time. It lifts when the app fetches `homework_done:true` |
| `daily_limit_min` / `app_limits` | v1: one DeviceActivityEvent threshold over `uroki_limited`, minutes = `daily_limit_min`, else the smallest `app_limits[].minutes`; reaching it shields that selection until midnight. No per-app limits |
| `unlock_until` | shields off now; every scheduled block gets `neverTriggerBefore = unlock_until`; a one-off schedule at `unlock_until` restores the bedtime/school/homework block that holds then. An exhausted limit comes back at the next app start |
| `block_new_apps` | `ManagedSettings application.denyAppInstallation` (no installs at all, not "until approved") |
| — | option on the child's phone «Запретить удалять приложения»: `application.denyAppRemoval` (stored on the device, not on the server) |
| `blocked_apps`, `new_apps`, `approved`, window `allowed` package lists | not used on iOS |

Order matches the Android decision: bedtime, then school, then homework. Times are converted from the family `tz` to
the phone's zone. DeviceActivity rejects intervals under 15 minutes; such windows are not scheduled.

Shield texts (ru/kk/en by `lang`): title «Сейчас нельзя», subtitle as Android `GuardText` (bedtime, school, homework,
app_limit, daily_limit), button «Понятно» closes the shield.
