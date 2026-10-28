# Уроки backend API: changes in stage 5 (migration `20261019_features2.sql`)

Base URL: `${EXPO_PUBLIC_API_URL}` (the `app` edge function, e.g. `https://<ref>.supabase.co/functions/v1/app`).
Authenticated calls send `Authorization: Bearer <device token>`. Send `x-lang: ru | kk | en` to get error texts translated.
Errors always come back as `{ "error": "<text>" }` with an HTTP status (400, 401, 402, 403, 404, 409, 413, 415, 429, 500).

This document covers only the endpoints that are **new or changed** in this stage. Everything else keeps working as before.
Stage 6 (screen time and textbook links, migration `20261022_screen_time.sql`) is in §12; its full contract is
[`SCREEN_TIME.md`](SCREEN_TIME.md).

Types used below:

- `Date` is `"YYYY-MM-DD"` (a family-local calendar date).
- `HM` is `"HH:MM"` in 24-hour time (family time zone).
- `ISO` is an ISO-8601 UTC timestamp, e.g. `"2026-10-19T12:34:56.000Z"`.
- `Role` is `"parent" | "child" | "viewer"`.

---

## 1. Roles: the new `viewer` role (tutor or teacher)

A family can let in read-only viewers by setting `allow_viewers: true` (`PUT /family`). A viewer joins with a viewer invite code (`POST /invite {role:"viewer"}` → `POST /join`). The `/join` response is unchanged: `{ token, device_id, role: "viewer" }`.

A viewer device may call **only** these endpoints:

| Method | Path |
|---|---|
| GET | `/me` |
| GET | `/setup?child=ID` |
| GET | `/parent/overview?child=ID` |
| GET | `/parent/report?child=ID&days=N` |
| GET | `/parent/calendar?month=YYYY-MM&child=ID` |
| GET | `/tasks/:id/messages` |
| DELETE | `/members/me` (leave the family) |

Every other call returns **403** `{ "error": "Только для родителя" }`. This includes `POST /push`: viewers get no push notifications. So the app should not register a push token for a viewer, or it should ignore the 403.

- Viewers count as parents for the subscription gate. With a lapsed subscription the read endpoints return 402 `"Подписка закончилась"`.
- If the parent sets `allow_viewers: false`, the server deletes every viewer device of the family; their next call returns 401. It also deletes any viewer invite codes that were not used yet.
- A viewer cannot be the last parent and does not count as one. Removing a parent still needs another **parent**.
- A parent removes a viewer with `DELETE /members/:device_id`, the same as any other member.

---

## 2. Invites: link and QR code

### `POST /invite` (parent), changed

Request:

```json
{ "role": "child" | "parent" | "viewer", "child_id": 12 }
```

- `role` defaults to `"child"`. `child_id` is used only when `role` is `"child"` (the default is the first child).
- `role: "viewer"` works only when `family.allow_viewers` is `true`. Otherwise you get **403** `"Сначала разрешите репетиторов в настройках семьи"`.

Response:

```json
{
  "code": "K7QMZP",
  "role": "child",
  "expires_at": "2026-10-21T09:00:00.000Z",
  "url": "https://<ref>.supabase.co/functions/v1/app/i/K7QMZP"
}
```

`url` is `null` only if the server has no `app_fn_url` configured. Encode `url` in the QR code and use it as the text for the share sheet.

### `GET /i/:code`, new, public (no auth)

This returns a small mobile-friendly HTML page:

- a big **"Открыть в «Уроки»"** button that opens `uroki://join?code=CODE`;
- the code in large type, for entering it by hand;
- App Store and Google Play buttons. On Android the Play button is `market://details?id=kz.uroki.app`, elsewhere `https://play.google.com/store/apps/details?id=kz.uroki.app`.

The language is taken from `?lang=ru|kk|en` first, then from `Accept-Language`, and defaults to `ru`. The page never reads the database. It looks the same whether the code is valid, used or made up, and it never shows family or child names.

**App team:** handle the deep link `uroki://join?code=CODE` by pre-filling the join screen with `code`, then calling `POST /join` as usual.

> Note: on the default `*.supabase.co` domain, Supabase may serve edge-function HTML as `text/plain`, which is the same as for the `/legal/*` pages. The QR code and the deep link still work, because the app reads `code` from the URL itself. Proper rendering needs a custom domain for `app_fn_url`.

---

## 3. Family settings

### `PUT /family` (parent): new fields

```json
{
  "quiet_from": "21:30",
  "quiet_to": "07:00",
  "allow_viewers": true
}
```

- **Quiet hours.** Send `quiet_from` and `quiet_to` together as `HM`, or both as `null` to clear them. The window may cross midnight, as in `22:00`–`07:00`. The start time is inside the window and the end time is not. Sending only one of the two, a bad format, or equal times returns **400** `"Тихие часы: укажите начало и конец в формате ЧЧ:ММ"`.
  - During quiet hours the scheduled **reminder and deadline pushes to the child's phone** are not sent and are not sent later either. Deadline alerts to **parents** (push and Telegram) are still sent. Pushes caused by someone's action are not affected by quiet hours: a parent's nudge, accept or redo, or a chat message.
- **`allow_viewers`** (boolean): `false` disconnects all viewer devices (see §1).

The response is the family object, as before, with the new fields added (see below).

### Family object (`/me` → `family`, `PUT /family` response): new fields

```json
{
  "quiet_from": "21:30" | null,
  "quiet_to": "07:00" | null,
  "allow_viewers": false
}
```

---

## 4. `GET /me`: changed

`device.role` and `members[].role` may now be `"viewer"`. Each member also has `last_seen`:

```json
{
  "members": [
    {
      "id": "7c1e…",
      "role": "parent" | "child" | "viewer",
      "name": "Мама",
      "telegram": false,
      "me": true,
      "child_id": null,
      "last_seen": "2026-10-19T12:34:56.000Z"
    }
  ]
}
```

`last_seen` (`ISO | null`) is when that device last called the API. Every authenticated request updates it. Use it for "online" or "last seen 5 min ago" labels.

---

## 5. Checklist items: home chores

### `POST /items`, `PATCH /items/:id` (parent): new fields

```json
{ "category": "school" | "home", "duration_min": 20 }
```

- `category` defaults to `"school"`. Any other value returns **400** `"Неизвестная категория"`.
- `duration_min` is an integer from 1 to 240, or `null` (no estimate). Anything else returns **400** `"Длительность: от 1 до 240 минут"`. Leave the field out to keep the current value.
- The `POST /items` response is the full item row and includes both fields.

### `GET /setup`: `items[]` changed

```json
{ "id": 5, "title": "Вынести мусор", "emoji": "🗑", "required": true, "needs_photo": false,
  "weekdays": [1, 3, 5], "pos": 0, "child_id": null, "category": "home", "duration_min": 5 }
```

Tasks copy `category` and `duration_min` from their item. Lessons are always `category: "school"` and `duration_min: null`. When a parent edits an item, the change also reaches that item's tasks that are still `todo`, as other item fields already do.

---

## 6. Task shape: new fields

The task objects in `GET /child/state` → `tasks[]` and `GET /parent/overview` → `days[].tasks[]` gain these fields:

```json
{
  "id": 901,
  "kind": "lesson" | "item",
  "label": "Математика",
  "category": "school" | "home",
  "duration_min": 20 | null,
  "messages": 3,
  "voice_url": "https://…signed…" | null
}
```

- `messages`: the number of chat messages on this task.
- `voice_url`: a signed link to the child's voice note, valid for **900 s**, or `null`. The file is AAC in an MP4 container (`.m4a`), or MP3/ADTS if that is what was uploaded. Get a fresh link by reloading the state or overview.

---

## 7. Month calendar

### `GET /parent/calendar?month=YYYY-MM&child=ID` (parent or viewer), new

- `month` is optional and defaults to the current month in family time. A bad format returns **400** `"Неверный месяц"`.
- `child` is optional and defaults to the first child.

Response:

```json
{
  "month": "2026-10",
  "child_id": 12,
  "days": [
    { "date": "2026-10-01", "status": "done_on_time", "total": 6, "done": 6 },
    { "date": "2026-10-02", "status": "partial", "total": 6, "done": 4 },
    { "date": "2026-10-04", "status": "off", "total": 0, "done": 0 }
  ]
}
```

`days` has one entry for every day of the month, in order. `total` and `done` count the day's **required** tasks; a `skip_ok` task counts as done. The `status` is chosen by the first rule that applies:

| status | rule |
|---|---|
| `done_on_time` | `total > 0`, every required task is done, and the last one was finished by the soft deadline on the evening before (the same rule as the weekly report) |
| `done_late` | `total > 0` and every task is done, but after that soft deadline |
| `off` | not a school day: a weekend or other non-school weekday, a day off, or a public holiday (when `auto_holidays` is on) |
| `future` | a school day after today (family time) that is not finished yet |
| `empty` | a school day, today or earlier, with no required tasks |
| `missed` | a school day, today or earlier, with no required task done |
| `partial` | a school day, today or earlier, with some but not all required tasks done |

A day's homework is due on the evening before. So **today** is already `missed` or `partial` if it was not finished last night, and the next school day stays `future` while the child is working on it.

---

## 8. One-day lesson overrides

An override replaces one day's **lessons** for one child, in the given order, instead of the timetable. Checklist items are not affected. An empty `subject_ids` list means "no lessons that day". If the date is the child's active school day, its tasks are updated right away. Untouched lesson tasks that are no longer listed are removed. Tasks the child has finished, photographed or voice-noted are kept.

### `PUT /overrides/:date` (parent), new

`:date` is a `Date`, today or later in family time. Request:

```json
{ "child_id": 12, "subject_ids": [3, 7, 9], "note": "Сокращённый день" }
```

- `child_id` is optional. The default is `?child=` or the first child; an unknown id returns 404 `"Ученик не найден"`.
- `subject_ids` is required, at most 14 entries, and duplicates are removed (the first occurrence keeps its place). A missing or non-array value returns 400 `"Нужен список предметов"`. More than 14 returns 400 `"Не больше 14 уроков в день"`. An id that is not one of the family's subjects returns 404 `"Предмет не найден"`.
- `note` is optional, at most 120 characters. An empty string or a missing value means `null`.
- A bad or past date returns 400 `"Неверная дата"`.

Response:

```json
{ "date": "2026-10-21", "child_id": 12, "subject_ids": [3, 7, 9], "note": "Сокращённый день" }
```

Calling it again for the same child and date replaces the override.

### `DELETE /overrides/:date?child=ID` (parent), new

This deletes the override, so the timetable applies again. The response is `{ "ok": true }`, even if there was no override.

### Where overrides show up

- `GET /setup` → `overrides`: this child's overrides from today to today + 30 days, sorted by date.

  ```json
  "overrides": [ { "date": "2026-10-21", "subject_ids": [3, 7, 9], "note": "Сокращённый день" } ]
  ```

  If a subject is deleted later, its id may stay in `subject_ids`. Ignore ids that are not in `subjects`.
- `GET /child/state` → `override_note: string | null`: the note of the override for `school_date`.
- `GET /parent/overview` → `days[].override_note: string | null`.

---

## 9. Per-task chat

Messages between the child and the parents about one task. A child device can use the chat only for its own child's tasks, and gets **404** `"Задание не найдено"` for anything else. Parents can use it for any task in the family. Viewers can read messages but not post. The chat is not limited to the active school day. It needs an active subscription, like the other daily features.

### `GET /tasks/:id/messages` (parent, child, viewer), new

This returns the last 100 messages, oldest first:

```json
[
  {
    "id": 41,
    "role": "child",
    "name": "Айгерим",
    "body": "Не понял задачу 3",
    "created_at": "2026-10-19T13:05:00.123Z",
    "mine": false
  }
]
```

- `role` is `"parent" | "child"`: which side wrote the message.
- `name` is the sender device's name. It is `null` if no name was set or the device has been removed.
- `mine` is `true` for messages from the calling device.

### `POST /tasks/:id/messages` (parent, child), new

Request:

```json
{ "body": "Посмотри пример на стр. 42" }
```

- `body` is trimmed. An empty body returns 400 `"Сообщение пустое"`. More than 500 characters returns 400 `"Сообщение длиннее 500 символов"`.
- The limit is 60 messages per hour per device; going over returns 429.
- Viewers get 403 `"Только для родителя"`.

The response is the created message, in the same shape as above, with `mine: true`.

Notifications:

- When a **child** posts, every parent device gets a push titled `💬 <task title>` with the body `<child name>: <text>`. Parents with Telegram connected also get the message there.
- When a **parent** posts, the devices of that task's child get a push titled `💬 <task title>` with the body `<parent device name>: <text>`.

---

## 10. Child voice note

### `POST /child/voice?task_id=ID` (child device only), new

- The request body is the **raw audio bytes**, not multipart.
- `Content-Type` must be one of `audio/mp4`, `audio/m4a`, `audio/x-m4a`, `audio/aac` or `audio/mpeg`. Anything else returns **415** `"Это не аудиозапись"`.
- The maximum size is **2 MB**; a larger file returns **413** `"Запись слишком большая"`. An empty body returns 400 `"Нет записи"`.
- The server checks the bytes themselves. It accepts MP4/M4A (`ftyp` box), ADTS AAC and MP3; anything else returns 415 `"Это не аудиозапись"`. Upload `.m4a` (AAC) recordings as `audio/mp4`.
- The task must be this child's task for the active school day. Otherwise you get 404 `"Задание не найдено"` or 400 `"Это задание не на ближайший учебный день"`.
- The limit is 60 uploads per day per family; going over returns 429.
- Each task has one voice note. A new recording replaces the old one, and the old file is deleted.
- Voice notes are deleted automatically after `photo_retention_days`, like photos. Recording a voice note does **not** change the task's status.

The response is `{ "ok": true }`. Reload `/child/state` to get the new `voice_url`.

---

## 11. Online status in the overview

### `GET /parent/overview`: new top-level fields

```json
{ "child_seen": "2026-10-19T12:34:56.000Z" | null }
```

`child_seen` is the most recent `last_seen` of this child's devices, or `null` if the child has no device.

---

## Summary of new error messages (ru → translated by `x-lang`)

| ru | en |
|---|---|
| Нет записи | No recording |
| Запись слишком большая | The recording is too large |
| Это не аудиозапись | This is not an audio recording |
| Сообщение пустое | The message is empty |
| Сообщение длиннее 500 символов | The message is longer than 500 characters |
| Не больше 14 уроков в день | At most 14 lessons a day |
| Предмет не найден | Subject not found |
| Нужен список предметов | A list of subjects is required |
| Неверный месяц | Invalid month |
| Тихие часы: укажите начало и конец в формате ЧЧ:ММ | Quiet hours: give both a start and an end as HH:MM |
| Неизвестная категория | Unknown category |
| Длительность: от 1 до 240 минут | Duration: 1 to 240 minutes |
| Сначала разрешите репетиторов в настройках семьи | Allow tutors in the family settings first |

The privacy policy now mentions voice notes, chat messages and viewers, so `LEGAL_VERSION` is now `2026-10-19.1`.

---

## 12. Stage 6: screen time and textbooks (migration `20261022_screen_time.sql`)

The contract, including the decision order the phone's guard applies, is [`SCREEN_TIME.md`](SCREEN_TIME.md). Summary:

| Method | Path | Who | Subscription |
|---|---|---|---|
| GET | `/screen/rules?child=ID` | parent, viewer, child (own child) | required (402) |
| PUT | `/screen/rules` | parent | required |
| POST | `/screen/unlock` | parent | required |
| POST | `/screen/approve` | parent | required |
| POST | `/screen/report` | child device | required |
| GET | `/textbooks?child=ID` | parent, viewer, child (own + shared) | not required |
| POST | `/textbooks` | parent | not required |
| DELETE | `/textbooks/:id` | parent | not required |

- `GET /screen/rules` → `{ rules, homework_done, homework_date, homework_due_today, tz, approved, lang, textbooks, device, today, school_day, new_apps }`.
- `PUT /screen/rules`, `POST /screen/unlock`, `POST /screen/approve` → the full `ScreenRules`.
- `POST /screen/report` → `{ ok: true, rules, homework_done, homework_date, homework_due_today, tz, approved, lang, today, school_day, new_apps }`.
- Step 7 (school window) applies only when `school_day` is true; step 8 (homework lock) only when
  `homework_due_today` is true.
- Viewers are added to the viewer allow-list for the two GETs only; every other screen/textbook call answers 403.
- With a lapsed subscription `/screen/*` returns 402; the guard then stops enforcing.
- Pushes: the child gets «⏱ Родитель дал N минут» on an unlock; parents get «Новое приложение: <name>» (push and
  Telegram) once per package when `block_new_apps` blocks a newly installed app (up to 3 names per push).

New error messages (ru → en; kk is translated as well):

| ru | en |
|---|---|
| Неверные правила | Invalid rules |
| Время в формате ЧЧ:ММ | Time must be HH:MM |
| Начало и конец совпадают | Start and end are the same |
| Минуты: от 1 до 1440 | Minutes: 1 to 1440 |
| Минуты: от 0 до 240 | Minutes: 0 to 240 |
| Неверное имя приложения | Invalid app package name |
| Не больше 200 приложений в списке | At most 200 apps per list |
| Не больше 100 ограничений по приложениям | At most 100 app limits |
| Не больше 500 приложений | At most 500 apps |
| Ссылка должна начинаться с http:// или https:// | The link must start with http:// or https:// |
| Ссылка длиннее 500 символов | The link is longer than 500 characters |
| Не больше 100 учебников | At most 100 textbooks |

Existing messages reused: `Только для родителя`, `Только для ученика`, `Ученик не найден`, `Название пустое`,
`День недели 1–7`, `Неизвестное действие`, `Слишком много попыток. Попробуйте позже.`

---

## Several devices of one child (phone + tablet)

- Each redeemed child invite (`POST /invite {role:"child", child_id}`) adds a device with that `child_id`; a child may have any number.
- `POST /join` and `POST /family` accept optional `platform` (`"android" | "ios" | "web"`); `POST /join` also `model` (e.g. `"Samsung SM-T220"`). A child's device is named after `model` (else the typed `name`); a parent's typed `name` comes first.
- Every app call sends the header `x-platform`; the server stores it on the device (so devices that joined earlier get it too).
- `GET /me`: each member also has `platform` (`string | null`).
- `PATCH /members/:device_id {name}` (parent): renames a device of the family (≤ 30 characters). `DELETE /members/:device_id` disconnects it.
- Chat: a child's messages carry the child's name and are `mine: true` on every device of that child.
- Screen time across devices (`devices`, `usage_other_devices`): see `docs/SCREEN_TIME.md` → "Several devices of one child".
