// deno-lint-ignore-file no-explicit-any
import { addDays, db, dow, esc, fmtLong, fmtShort, HttpError, imageType, localParts, toMin } from "./lib.ts";
import { isHoliday } from "./holidays.ts";
import { notifyChild, notifyParents } from "./notify.ts";

export const isDone = (t: any) => t.status === "done" || t.status === "skip_ok";

export async function getFamily(id: string) {
  const { data } = await db.from("app_families").select("*").eq("id", id).single();
  if (!data) throw new HttpError(404, "Семья не найдена");
  return data;
}

// ---------- children ----------
// A "kid" is the family row plus one child: { ...family, child_id, child_name }. Functions that work on a
// child's tasks take a kid; family-wide ones (settings, days off) only read the family fields.
export async function children(familyId: string) {
  const { data } = await db.from("app_children").select("id, name, pos").eq("family_id", familyId).order("pos").order("id");
  return (data ?? []) as { id: number; name: string; pos: number }[];
}
export async function kidOf(fam: any, childId?: number | null, strict = true) {
  const list = await children(fam.id);
  // for changes an explicit id must match (a stale id must not silently act on a sibling); reads and
  // "no id" use the first child
  const c = (childId && list.find((x) => x.id === childId)) || (strict && childId ? undefined : list[0]);
  if (!c) throw new HttpError(404, "Ученик не найден");
  return { ...fam, child_id: c.id, child_name: c.name };
}

async function offSet(familyId: string) {
  const { data } = await db.from("app_days_off").select("date").eq("family_id", familyId);
  return new Set<string>((data ?? []).map((r: any) => r.date));
}

// A school day = one of the family's school weekdays that is not a day off or (optionally) a public holiday.
export function schoolDays(weekdays: number[] | null, off: Set<string>, holidays?: (d: string) => boolean) {
  const wd = new Set(weekdays?.length ? weekdays : [1, 2, 3, 4, 5]);
  return (d: string) => wd.has(dow(d)) && !off.has(d) && !(holidays && holidays(d));
}
const holidaysOf = (fam: any) => (fam.auto_holidays === false ? undefined : (d: string) => isHoliday(fam.country ?? "KZ", d));

// Week parity for alternating timetables: 1 = odd week, 2 = even week. Counted as weeks since Monday 2024-01-01
// (ISO week 1), so it matches ISO numbering in 2024–2026 but never repeats a parity across a 53-week year.
export function weekParity(iso: string) {
  const days = Math.round((Date.parse(iso + "T00:00:00Z") - Date.UTC(2024, 0, 1)) / 86400000);
  return Math.floor(days / 7) % 2 === 0 ? 1 : 2;
}

export function nextSchoolDay(after: string, isSchool: (d: string) => boolean) {
  for (let i = 1; i < 40; i++) {
    const d = addDays(after, i);
    if (isSchool(d)) return d;
  }
  return addDays(after, 1);
}

export async function activeDay(fam: any) {
  const now = localParts(fam.tz);
  const isSchool = schoolDays(fam.school_weekdays, await offSet(fam.id), holidaysOf(fam));
  const S = nextSchoolDay(now.date, isSchool);
  return { now, S, due: addDays(S, -1), isSchool };
}

// Deletes tasks nobody has worked on (not done/skip_ok, no active photo) on dates that are no longer school days.
export async function dropOpenTasks(familyId: string, from: string, to: string | null, drop: (d: string) => boolean) {
  let q = db.from("app_tasks").select("id, school_date, status, app_photos(active)").eq("family_id", familyId).gte("school_date", from);
  if (to) q = q.lte("school_date", to);
  const { data } = await q;
  const ids = (data ?? []).filter((t: any) => drop(t.school_date) && !isDone(t) && !(t.app_photos ?? []).some((p: any) => p.active)).map((t: any) => t.id);
  if (ids.length) await db.from("app_tasks").delete().in("id", ids);
}

// Creates the day's tasks from the lesson schedule + checklist and keeps them in sync when the setup changes.
export async function ensureTasks(fam: any, S: string) {
  const wd = dow(S);
  const [{ data: lessons }, { data: items }, { data: existing }] = await Promise.all([
    db.from("app_lessons").select("pos, week_parity, subject_id, app_subjects(name, emoji, light)").eq("child_id", fam.child_id).eq("weekday", wd).order("pos"),
    // checklist items for everyone (child_id null) or for this child
    db.from("app_items").select("*").eq("family_id", fam.id).or(`child_id.is.null,child_id.eq.${fam.child_id}`).order("pos").order("id"),
    db.from("app_tasks").select("id, kind, ref_id, status, title, emoji, required, needs_photo, light, pos, app_photos(id, active)").eq("child_id", fam.child_id).eq("school_date", S),
  ]);
  const desired = new Map<string, any>();
  // alternating timetable: when this weekday has odd/even-week lessons, use the set for S's week; plain lessons otherwise
  const parity = weekParity(S);
  const all: any[] = lessons ?? [];
  const alternating = all.some((l) => l.week_parity);
  for (const l of alternating ? all.filter((l) => l.week_parity === parity) : all.filter((l) => !l.week_parity)) {
    const k = `lesson:${l.subject_id}`;
    if (desired.has(k) || !l.app_subjects) continue;
    desired.set(k, {
      family_id: fam.id, child_id: fam.child_id, school_date: S, kind: "lesson", ref_id: l.subject_id, title: l.app_subjects.name,
      emoji: l.app_subjects.emoji, light: l.app_subjects.light, needs_photo: true, required: true, pos: l.pos,
    });
  }
  for (const it of items ?? []) {
    if (it.weekdays && it.weekdays.length && !it.weekdays.includes(wd)) continue;
    desired.set(`item:${it.id}`, {
      family_id: fam.id, child_id: fam.child_id, school_date: S, kind: "item", ref_id: it.id, title: it.title, emoji: it.emoji,
      light: false, needs_photo: it.needs_photo, required: it.required, pos: 1000 + (it.pos ?? 0),
    });
  }
  const have = new Map<string, any>((existing ?? []).map((t: any) => [`${t.kind}:${t.ref_id}`, t]));
  const insert = [...desired.entries()].filter(([k]) => !have.has(k)).map(([, v]) => v);
  if (insert.length) await db.from("app_tasks").upsert(insert, { onConflict: "child_id,school_date,kind,ref_id", ignoreDuplicates: true });
  // untouched tasks follow edits; finished tasks and tasks with photos are never removed
  const stale = [...have.entries()].filter(([k, t]) => !desired.has(k) && !isDone(t) && !(t.app_photos ?? []).some((p: any) => p.active)).map(([, t]) => t.id);
  if (stale.length) await db.from("app_tasks").delete().in("id", stale);
  for (const [k, t] of have) {
    const d = desired.get(k);
    if (!d || t.status !== "todo") continue;
    if (t.title !== d.title || t.emoji !== d.emoji || t.required !== d.required || t.needs_photo !== d.needs_photo || t.light !== d.light || t.pos !== d.pos) {
      await db.from("app_tasks").update({ title: d.title, emoji: d.emoji, required: d.required, needs_photo: d.needs_photo, light: d.light, pos: d.pos }).eq("id", t.id);
    }
  }
}

export async function loadTasks(kid: { id: string; child_id: number }, from: string, to = from): Promise<any[]> {
  const { data } = await db.from("app_tasks").select("*, app_photos(id, path, page_no, taken_at, active)")
    .eq("family_id", kid.id).eq("child_id", kid.child_id).gte("school_date", from).lte("school_date", to)
    .order("school_date", { ascending: false }).order("pos").order("id");
  return (data ?? []).map((t: any) => ({
    ...t,
    photos: (t.app_photos ?? []).filter((p: any) => p.active).sort((a: any, b: any) => a.page_no - b.page_no),
  }));
}

export async function signPhotos(tasks: any[]) {
  const paths = tasks.flatMap((t) => t.photos.map((p: any) => p.path));
  if (!paths.length) return;
  // short-lived: a link forwarded out of the app stops working soon
  const { data } = await db.storage.from("app-photos").createSignedUrls(paths, 900);
  const m = new Map((data ?? []).map((r: any) => [r.path, r.signedUrl]));
  for (const t of tasks) for (const p of t.photos) p.url = m.get(p.path) ?? null;
}

export function shape(t: any, tz: string) {
  const hm = (iso: string | null) => (iso ? localParts(tz, new Date(iso)).hm : null);
  return {
    id: t.id, kind: t.kind, label: t.title, emoji: t.emoji, light: t.light, needs_photo: t.needs_photo,
    required: t.required, status: t.status, skip_reason: t.skip_reason, accepted: t.accepted,
    done_at: t.done_at, done_hm: hm(t.done_at), note: t.note ?? null, parent_comment: t.parent_comment ?? null,
    photos: t.photos.map((p: any) => ({ id: p.id, url: p.url ?? null, at: p.taken_at, page: p.page_no, hm: hm(p.taken_at) })),
  };
}

function doneBy(iso: string | null, tz: string, due: string, hm: string) {
  if (!iso) return false;
  const l = localParts(tz, new Date(iso));
  return l.date < due || (l.date === due && toMin(l.hm) <= toMin(hm));
}

const STREAK_ROWS = 1000; // PostgREST max_rows
export async function streakStats(fam: any, today: string, S: string, isSchool: (d: string) => boolean) {
  const { data } = await db.from("app_tasks").select("school_date, status, done_at")
    .eq("child_id", fam.child_id).eq("required", true).gte("school_date", addDays(today, -90)).lte("school_date", S)
    .order("school_date", { ascending: false }).order("id").limit(STREAK_ROWS);
  const rows: any[] = data ?? [];
  // a capped read can end in the middle of the oldest day: leave that day out
  const cut = rows.length >= STREAK_ROWS ? rows[rows.length - 1].school_date : null;
  const byDay = new Map<string, any[]>();
  for (const t of rows) {
    if (t.school_date === cut) continue;
    if (!byDay.has(t.school_date)) byDay.set(t.school_date, []);
    byDay.get(t.school_date)!.push(t);
  }
  let streak = 0, week = 0, stop = false;
  for (const d of [...byDay.keys()].sort().reverse()) {
    const ts = byDay.get(d)!;
    const complete = ts.every(isDone);
    const last = ts.map((t) => t.done_at).filter(Boolean).sort().pop() ?? null;
    // a day that is no longer a school day (day off, dropped weekday) never breaks the streak; if it was done in time it still counts
    if (!isSchool(d) && !(complete && doneBy(last, fam.tz, addDays(d, -1), fam.hard_deadline))) continue;
    if (d >= addDays(today, -7) && complete && doneBy(last, fam.tz, addDays(d, -1), fam.soft_deadline)) week++;
    if (stop || (d === S && !complete)) continue;
    if (complete && doneBy(last, fam.tz, addDays(d, -1), fam.hard_deadline)) streak++;
    else stop = true;
  }
  return { streak, perfect_week: week };
}

export async function childState(fam: any) {
  const { now, S, due, isSchool } = await activeDay(fam);
  await ensureTasks(fam, S);
  const tasks = await loadTasks(fam, S);
  await signPhotos(tasks);
  const dueToday = due === now.date;
  // the next school days after S, so the phone can schedule reminders even if the app is not opened
  const upcoming: { due_date: string; school_date: string }[] = [];
  for (let d = S; upcoming.length < 6;) {
    d = nextSchoolDay(d, isSchool);
    if (!isSchool(d)) break;
    upcoming.push({ due_date: addDays(d, -1), school_date: d });
  }
  return {
    name: fam.child_name, child_id: fam.child_id, tz: fam.tz, school_date: S, school_label: fmtLong(S), due_date: due, due_label: fmtShort(due),
    due_today: dueToday, soft: fam.soft_deadline, hard: fam.hard_deadline, remind_times: fam.remind_times, now_hm: now.hm,
    mins_to_soft: dueToday ? toMin(fam.soft_deadline) - toMin(now.hm) : null,
    mins_to_hard: dueToday ? toMin(fam.hard_deadline) - toMin(now.hm) : null,
    ...(await streakStats(fam, now.date, S, isSchool)),
    upcoming,
    reward: fam.reward_goal ? { goal: fam.reward_goal, text: fam.reward_text ?? "" } : null,
    track_time: !!fam.track_time,
    started_at: fam.track_time ? await sessionStart(fam.child_id, S) : null,
    tasks: tasks.map((t) => shape(t, fam.tz)),
  };
}

async function sessionStart(childId: number, S: string) {
  const { data } = await db.from("app_sessions").select("started_at").eq("child_id", childId).eq("school_date", S).maybeSingle();
  return data?.started_at ?? null;
}

// Optional time tracking: the child taps "Начать уроки"; the first tap of the day counts.
export async function startSession(fam: any) {
  if (!fam.track_time) throw new HttpError(400, "Учёт времени выключен");
  const { S } = await activeDay(fam);
  await db.from("app_sessions").upsert({ family_id: fam.id, child_id: fam.child_id, school_date: S }, { onConflict: "child_id,school_date", ignoreDuplicates: true });
  return await sessionStart(fam.child_id, S);
}

// What was assigned: written by the child (for the next school day) or by a parent (any task).
export async function setNote(fam: any, taskId: number, note: string, byChild: boolean) {
  if (byChild) await childTask(fam, taskId);
  else await taskOf(fam, taskId);
  await db.from("app_tasks").update({ note: note || null }).eq("id", taskId).eq("family_id", fam.id);
}

// Report for the parent: per day and per subject, the last `days` days up to today (7 for the weekly report,
// up to 31 for the monthly PDF export).
export async function weeklyReport(fam: any, days = 7) {
  const now = localParts(fam.tz);
  const from = addDays(now.date, -(Math.min(31, Math.max(7, days)) - 1));
  const tasks = await loadTasks(fam, from, addDays(now.date, 1));
  const { data: sess } = await db.from("app_sessions").select("school_date, started_at").eq("child_id", fam.child_id).gte("school_date", from);
  const startOf = new Map<string, string>((sess ?? []).map((r: any) => [r.school_date, r.started_at]));
  const byDay = new Map<string, any[]>();
  for (const t of tasks) {
    if (!t.required) continue;
    if (!byDay.has(t.school_date)) byDay.set(t.school_date, []);
    byDay.get(t.school_date)!.push(t);
  }
  const subjects = new Map<string, { title: string; emoji: string; total: number; onTime: number; late: number; skipped: number; missed: number }>();
  const perDay = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, ts]) => {
    let onTime = 0, late = 0, skipped = 0, missed = 0;
    for (const t of ts) {
      const key = `${t.kind}:${t.ref_id}`;
      const s = subjects.get(key) ?? { title: t.title, emoji: t.emoji, total: 0, onTime: 0, late: 0, skipped: 0, missed: 0 };
      s.total++;
      if (t.status === "skip_ok") { skipped++; s.skipped++; }
      else if (isDone(t)) {
        if (doneBy(t.done_at, fam.tz, addDays(date, -1), fam.soft_deadline)) { onTime++; s.onTime++; } else { late++; s.late++; }
      } else if (date <= now.date) { missed++; s.missed++; }
      subjects.set(key, s);
    }
    const last = ts.filter(isDone).map((t) => t.done_at).filter(Boolean).sort().pop() ?? null;
    const start = startOf.get(date) ?? null;
    const minutes = start && last ? Math.max(0, Math.round((new Date(last).getTime() - new Date(start).getTime()) / 60000)) : null;
    return { date, total: ts.length, on_time: onTime, late, skipped, missed, minutes };
  });
  const list = [...subjects.values()];
  return {
    child_id: fam.child_id, child_name: fam.child_name, from, to: now.date, days: perDay,
    subjects: list.sort((a, b) => b.missed + b.late - (a.missed + a.late)),
    totals: perDay.reduce((a, d) => ({ total: a.total + d.total, on_time: a.on_time + d.on_time, late: a.late + d.late, skipped: a.skipped + d.skipped, missed: a.missed + d.missed }), { total: 0, on_time: 0, late: 0, skipped: 0, missed: 0 }),
    ...(await streakStats(fam, now.date, now.date, schoolDays(fam.school_weekdays, await offSet(fam.id), holidaysOf(fam)))),
  };
}

export async function overview(fam: any) {
  const { now, S, isSchool } = await activeDay(fam);
  await ensureTasks(fam, S);
  const tasks = await loadTasks(fam, addDays(now.date, -14), S);
  await signPhotos(tasks);
  const byDay = new Map<string, any[]>();
  for (const t of tasks) {
    if (!byDay.has(t.school_date)) byDay.set(t.school_date, []);
    byDay.get(t.school_date)!.push(t);
  }
  // days that are no longer school days only stay in history if the child actually did something
  for (const [d, ts] of byDay) if (d !== S && !isSchool(d) && !ts.some((t) => isDone(t) || t.photos.length)) byDay.delete(d);
  if (!byDay.has(S)) byDay.set(S, []);
  const days = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([date, ts]) => {
    const req = ts.filter((t) => t.required);
    const last = req.filter(isDone).map((t) => t.done_at).filter(Boolean).sort().pop() ?? null;
    return {
      date, label: fmtLong(date), total: req.length, done: req.filter(isDone).length,
      last_done_hm: last ? localParts(fam.tz, new Date(last)).hm : null,
      on_time: req.length > 0 && req.every(isDone) && doneBy(last, fam.tz, addDays(date, -1), fam.soft_deadline),
      tasks: ts.map((t) => shape(t, fam.tz)),
    };
  });
  const { data: off } = await db.from("app_days_off").select("date").eq("family_id", fam.id).gte("date", now.date).order("date");
  return {
    child_id: fam.child_id, child_name: fam.child_name, now_hm: now.hm, active: S, days, ...(await streakStats(fam, now.date, S, isSchool)),
    days_off: (off ?? []).map((o: any) => o.date),
  };
}

async function taskOf(fam: any, id: number) {
  const { data } = await db.from("app_tasks").select("*").eq("id", id).eq("family_id", fam.id).maybeSingle();
  if (!data) throw new HttpError(404, "Задание не найдено");
  return data;
}

export const allDoneSlot = (childId: number) => `all_done:${childId}`;
export async function checkAllDone(fam: any, S: string, quiet = false) {
  const tasks = await loadTasks(fam, S);
  const req = tasks.filter((t) => t.required);
  if (!req.length || req.some((t) => !isDone(t))) return;
  const { error } = await db.from("app_reminder_log").insert({ family_id: fam.id, school_date: S, slot: allDoneSlot(fam.child_id) });
  if (error || quiet) return;
  const last = req.map((t) => t.done_at).filter(Boolean).sort().pop();
  const when = last ? localParts(fam.tz, new Date(last)).hm : "";
  await notifyParents(fam.id, { title: "🎉 Всё готово", body: `${fam.child_name} всё сделал(а) к ${fmtShort(S)}` },
    { html: `🎉 <b>${esc(fam.child_name)}: всё готово на ${esc(fmtShort(S))}!</b>\nПоследнее задание — в ${when}.` });
}

// Parent actions; also used by the Telegram buttons. `undoOf` limits 'undo' to that action (Telegram buttons).
export async function applyAction(fam: any, id: number, action: string, undoOf?: string, comment?: string): Promise<string> {
  const t = await taskOf(fam, id);
  fam = await kidOf(fam, t.child_id); // notifications and "all done" are about the task's child
  const name = t.title;
  const clearAllDone = () => db.from("app_reminder_log").delete().eq("family_id", fam.id).eq("school_date", t.school_date).eq("slot", allDoneSlot(fam.child_id));
  // Applies the change and keeps a snapshot of the task before it, so 'undo' can put everything back.
  const save = async (patch: any, photo_ids: number[] = []) => {
    const undo = {
      action, status: t.status, accepted: t.accepted, done_at: t.done_at, skip_reason: t.skip_reason, photo_ids,
      after_status: patch.status ?? t.status, after_accepted: patch.accepted ?? t.accepted,
    };
    const { error } = await db.from("app_tasks").update({ ...patch, undo }).eq("id", id);
    if (error) throw new HttpError(500, error.message);
  };
  switch (action) {
    case "ok":
      await save({ accepted: true });
      await notifyChild(fam.id, fam.child_id, "👍 Принято", name);
      return `👍 Принято: ${name}`;
    case "done":
      await save({ status: "done", accepted: true, done_at: new Date().toISOString() });
      await checkAllDone(fam, t.school_date);
      return `✅ Отмечено: ${name}`;
    case "redo": {
      const { data: ph } = await db.from("app_photos").select("id").eq("task_id", id).eq("active", true);
      const ids: number[] = (ph ?? []).map((p: any) => p.id);
      await save({ status: "redo", accepted: false, done_at: null, ...(comment !== undefined ? { parent_comment: comment || null } : {}) }, ids);
      if (ids.length) await db.from("app_photos").update({ active: false }).in("id", ids);
      await clearAllDone();
      await notifyChild(fam.id, fam.child_id, "🔄 Нужно переснять", comment ? `${name}: ${comment}` : `${name}: сфотографируй заново`);
      return `🔄 Попросили переснять: ${name}`;
    }
    case "skip_ok":
      // an approved request counts from when the child asked, not from when the parent answered
      await save({ status: "skip_ok", accepted: true, done_at: t.status === "skip_pending" && t.done_at ? t.done_at : new Date().toISOString() });
      await notifyChild(fam.id, fam.child_id, "✅ Пропуск одобрен", name);
      await checkAllDone(fam, t.school_date);
      return `✅ Пропуск одобрен: ${name}`;
    case "skip_no":
      await save({ status: "skip_no", done_at: null });
      await notifyChild(fam.id, fam.child_id, "❌ Пропуск не одобрен", `${name}: нужно выполнить`);
      return `❌ Пропуск отклонён: ${name}`;
    case "comment":
      await db.from("app_tasks").update({ parent_comment: comment || null }).eq("id", id);
      if (comment) await notifyChild(fam.id, fam.child_id, "💬 Комментарий родителя", `${name}: ${comment}`);
      return `💬 Комментарий сохранён: ${name}`;
    case "reset":
      await db.from("app_tasks").update({ status: "todo", accepted: false, done_at: null, skip_reason: null, undo: null }).eq("id", id);
      await db.from("app_photos").update({ active: false }).eq("task_id", id);
      await clearAllDone();
      await notifyChild(fam.id, fam.child_id, "↩️ Отметка отменена", `${name}: нужно выполнить заново`);
      return `↩️ Выполнение отменено: ${name}`;
    case "undo": {
      const u = t.undo;
      if (!u) throw new HttpError(409, "Нечего отменять");
      if (undoOf && u.action !== undoOf) throw new HttpError(409, "Задание уже изменилось");
      // only if nobody touched the task since the action being undone
      const { data: rows, error } = await db.from("app_tasks")
        .update({ status: u.status, accepted: !!u.accepted, done_at: u.done_at ?? null, skip_reason: u.skip_reason ?? null, undo: null })
        .eq("id", id).eq("status", u.after_status).eq("accepted", !!u.after_accepted).select("id");
      if (error) throw new HttpError(500, error.message);
      if (!rows?.length) throw new HttpError(409, "Задание уже изменилось");
      const ids = (Array.isArray(u.photo_ids) ? u.photo_ids : []).map(Number).filter(Number.isInteger);
      if (ids.length) await db.from("app_photos").update({ active: true }).eq("task_id", id).in("id", ids);
      if (isDone(u)) await checkAllDone(fam, t.school_date, true);
      else await clearAllDone();
      if (u.action === "redo") await notifyChild(fam.id, fam.child_id, "↩️ Переснимать не нужно", name);
      if (u.action === "skip_no") await notifyChild(fam.id, fam.child_id, "↩️ Решение отменено", `${name}: запрос на пропуск снова ждёт ответа`);
      return `↩️ Отменено: ${name}`;
    }
  }
  throw new HttpError(400, "Неизвестное действие");
}

// ---------- subscription ----------
// Billing is switched on by the app_billing_enabled secret once store products exist; until then everyone has access.
export function accessOf(fam: any, billingOn: boolean) {
  const now = new Date();
  const paid = !!fam.paid_until && new Date(fam.paid_until) > now;
  const granted = !!fam.granted_until && new Date(fam.granted_until) > now;
  const active = !billingOn || !!fam.free_forever || paid || granted;
  return {
    active, billing: billingOn, free_forever: !!fam.free_forever, paid_until: fam.paid_until ?? null, granted_until: fam.granted_until ?? null,
    trial: paid && fam.billing_period === "trial", store: fam.billing_store ?? null,
  };
}

// ---------- data lifecycle ----------
async function removeObjects(paths: string[]) {
  for (let i = 0; i < paths.length; i += 100) await db.storage.from("app-photos").remove(paths.slice(i, i + 100));
}

// Photos older than the family's retention window, and photos replaced by a re-shoot, are deleted for good.
export async function purgePhotos(fam: any) {
  const cutoff = new Date(Date.now() - (fam.photo_retention_days ?? 30) * 86400_000).toISOString();
  const stale = new Date(Date.now() - 86400_000).toISOString();
  const { data } = await db.from("app_photos").select("id, path, taken_at, active, app_tasks!inner(family_id)")
    .eq("app_tasks.family_id", fam.id).or(`taken_at.lt."${cutoff}",and(active.eq.false,taken_at.lt."${stale}")`).limit(500);
  const rows: any[] = data ?? [];
  if (!rows.length) return 0;
  await removeObjects(rows.map((r) => r.path));
  await db.from("app_photos").delete().in("id", rows.map((r) => r.id));
  return rows.length;
}

// Account deletion (Apple 5.1.1(v), Google Play): every photo file and every row of the family.
export async function deleteFamily(familyId: string) {
  for (;;) {
    const { data } = await db.storage.from("app-photos").list(familyId, { limit: 100 });
    const dirs: any[] = data ?? [];
    if (!dirs.length) break;
    let removed = 0;
    for (const d of dirs) {
      const { data: files } = await db.storage.from("app-photos").list(`${familyId}/${d.name}`, { limit: 1000 });
      const paths = (files ?? []).map((f: any) => `${familyId}/${d.name}/${f.name}`);
      if (paths.length) await removeObjects(paths);
      removed += paths.length;
    }
    if (!removed) break;
  }
  await db.from("app_trial_claims").update({ family_id: null }).eq("family_id", familyId);
  const { error } = await db.from("app_families").delete().eq("id", familyId);
  if (error) throw new HttpError(500, error.message);
}

// ---------- child actions ----------
export async function childTask(fam: any, id: number) {
  const { S } = await activeDay(fam);
  const t = await taskOf(fam, id);
  if (t.child_id !== fam.child_id) throw new HttpError(404, "Задание не найдено");
  if (t.school_date !== S) throw new HttpError(400, "Это задание не на ближайший учебный день");
  return { t, S };
}

export const MAX_PHOTO = 8_000_000;
export async function uploadPhoto(fam: any, taskId: number, bytes: Uint8Array<ArrayBuffer>) {
  if (!bytes.length) throw new HttpError(400, "Нет фото");
  if (bytes.length > MAX_PHOTO) throw new HttpError(413, "Фото слишком большое");
  // trust the bytes, not the header
  const type = imageType(bytes);
  if (!type) throw new HttpError(415, "Это не фото");
  const { t, S } = await childTask(fam, taskId);
  if (t.status === "skip_ok") throw new HttpError(400, "Пропуск уже одобрен");
  const { count } = await db.from("app_photos").select("id", { count: "exact", head: true }).eq("task_id", taskId).eq("active", true);
  if ((count ?? 0) >= 2) throw new HttpError(400, "Максимум 2 фото");
  const page = (count ?? 0) + 1;
  const contentType = type === "image/png" || type === "image/webp" ? type : "image/jpeg";
  const path = `${fam.id}/${S}/${taskId}-${Date.now()}.${contentType === "image/jpeg" ? "jpg" : contentType.slice(6)}`;
  const up = await db.storage.from("app-photos").upload(path, bytes, { contentType });
  if (up.error) throw new HttpError(500, up.error.message);
  await db.from("app_photos").insert({ task_id: taskId, path, page_no: page });
  await db.from("app_tasks").update({ status: "done", accepted: false, done_at: new Date().toISOString(), skip_reason: null, undo: null }).eq("id", taskId);
  const now = localParts(fam.tz);
  const late = now.date === addDays(S, -1) && toMin(now.hm) > toMin(fam.soft_deadline) ? " ⚠️ после дедлайна" : "";
  await notifyParents(
    fam.id,
    { title: `📸 ${fam.child_name}: ${t.emoji} ${t.title}`, body: `Новое фото · стр. ${page}` },
    {
      html: `${esc(fam.child_name)} · ${esc(t.emoji)} <b>${esc(t.title)}</b> · стр. ${page}\n🕐 ${now.hm} · на ${esc(fmtShort(S))}${late}`,
      photo: bytes,
      markup: page === 1 ? { inline_keyboard: [[{ text: "👍 Принять", callback_data: `t:ok:${taskId}` }, { text: "🔄 Переснять", callback_data: `t:redo:${taskId}` }]] } : undefined,
    },
  );
  await checkAllDone(fam, S);
}

export async function requestSkip(fam: any, taskId: number, reason: string) {
  const { t, S } = await childTask(fam, taskId);
  if (t.status === "skip_ok" || t.status === "skip_pending") return;
  if (t.status === "done") throw new HttpError(400, "Уже сдано");
  // done_at = when the child asked; an approval keeps it (see applyAction 'skip_ok')
  await db.from("app_tasks").update({ status: "skip_pending", skip_reason: reason, done_at: new Date().toISOString(), undo: null }).eq("id", taskId);
  await notifyParents(
    fam.id,
    { title: `🙋 ${fam.child_name}: запрос на пропуск`, body: `${t.emoji} ${t.title}: ${reason}` },
    {
      html: `🙋 <b>${esc(fam.child_name)} просит пропустить:</b> ${esc(t.emoji)} ${esc(t.title)}\nНа ${esc(fmtShort(S))}\nПричина: <i>${esc(reason)}</i>`,
      markup: { inline_keyboard: [[{ text: "✅ Одобрить", callback_data: `s:ok:${taskId}` }, { text: "❌ Отклонить", callback_data: `s:no:${taskId}` }]] },
    },
  );
}

// Items that do not need a photo are simply ticked by the child.
export async function checkItem(fam: any, taskId: number, done: boolean) {
  const { t, S } = await childTask(fam, taskId);
  if (t.needs_photo) throw new HttpError(400, "Для этого пункта нужно фото");
  await db.from("app_tasks").update(done ? { status: "done", done_at: new Date().toISOString(), undo: null } : { status: "todo", done_at: null, accepted: false, undo: null }).eq("id", taskId);
  if (done) await checkAllDone(fam, S);
  else await db.from("app_reminder_log").delete().eq("family_id", fam.id).eq("school_date", S).eq("slot", allDoneSlot(fam.child_id));
}
