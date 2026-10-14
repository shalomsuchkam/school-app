// deno-lint-ignore-file no-explicit-any
import { addDays, db, dow, esc, fmtLong, fmtShort, HttpError, localParts, toMin } from "./lib.ts";
import { notifyChild, notifyParents } from "./notify.ts";

export const isDone = (t: any) => t.status === "done" || t.status === "skip_ok";

export async function getFamily(id: string) {
  const { data } = await db.from("app_families").select("*").eq("id", id).single();
  if (!data) throw new HttpError(404, "Семья не найдена");
  return data;
}

async function offSet(familyId: string) {
  const { data } = await db.from("app_days_off").select("date").eq("family_id", familyId);
  return new Set<string>((data ?? []).map((r: any) => r.date));
}

export function nextSchoolDay(after: string, weekdays: number[], off: Set<string>) {
  const wd = new Set(weekdays.length ? weekdays : [1, 2, 3, 4, 5]);
  for (let i = 1; i < 40; i++) {
    const d = addDays(after, i);
    if (wd.has(dow(d)) && !off.has(d)) return d;
  }
  return addDays(after, 1);
}

export async function activeDay(fam: any) {
  const now = localParts(fam.tz);
  const S = nextSchoolDay(now.date, fam.school_weekdays ?? [], await offSet(fam.id));
  return { now, S, due: addDays(S, -1) };
}

// Creates the day's tasks from the lesson schedule + checklist and keeps them in sync when the setup changes.
export async function ensureTasks(fam: any, S: string) {
  const wd = dow(S);
  const [{ data: lessons }, { data: items }, { data: existing }] = await Promise.all([
    db.from("app_lessons").select("pos, subject_id, app_subjects(name, emoji, light)").eq("family_id", fam.id).eq("weekday", wd).order("pos"),
    db.from("app_items").select("*").eq("family_id", fam.id).order("pos").order("id"),
    db.from("app_tasks").select("id, kind, ref_id, status, title, emoji, required, needs_photo, light, pos, app_photos(id)").eq("family_id", fam.id).eq("school_date", S),
  ]);
  const desired = new Map<string, any>();
  for (const l of lessons ?? []) {
    const k = `lesson:${l.subject_id}`;
    if (desired.has(k) || !l.app_subjects) continue;
    desired.set(k, {
      family_id: fam.id, school_date: S, kind: "lesson", ref_id: l.subject_id, title: l.app_subjects.name,
      emoji: l.app_subjects.emoji, light: l.app_subjects.light, needs_photo: true, required: true, pos: l.pos,
    });
  }
  for (const it of items ?? []) {
    if (it.weekdays && it.weekdays.length && !it.weekdays.includes(wd)) continue;
    desired.set(`item:${it.id}`, {
      family_id: fam.id, school_date: S, kind: "item", ref_id: it.id, title: it.title, emoji: it.emoji,
      light: false, needs_photo: it.needs_photo, required: it.required, pos: 1000 + (it.pos ?? 0),
    });
  }
  const have = new Map<string, any>((existing ?? []).map((t: any) => [`${t.kind}:${t.ref_id}`, t]));
  const insert = [...desired.entries()].filter(([k]) => !have.has(k)).map(([, v]) => v);
  if (insert.length) await db.from("app_tasks").upsert(insert, { onConflict: "family_id,school_date,kind,ref_id", ignoreDuplicates: true });
  // untouched tasks follow edits; tasks with progress are never removed
  const stale = [...have.entries()].filter(([k, t]) => !desired.has(k) && t.status === "todo" && !(t.app_photos ?? []).length).map(([, t]) => t.id);
  if (stale.length) await db.from("app_tasks").delete().in("id", stale);
  for (const [k, t] of have) {
    const d = desired.get(k);
    if (!d || t.status !== "todo") continue;
    if (t.title !== d.title || t.emoji !== d.emoji || t.required !== d.required || t.needs_photo !== d.needs_photo || t.light !== d.light || t.pos !== d.pos) {
      await db.from("app_tasks").update({ title: d.title, emoji: d.emoji, required: d.required, needs_photo: d.needs_photo, light: d.light, pos: d.pos }).eq("id", t.id);
    }
  }
}

export async function loadTasks(familyId: string, from: string, to = from): Promise<any[]> {
  const { data } = await db.from("app_tasks").select("*, app_photos(id, path, page_no, taken_at, active)")
    .eq("family_id", familyId).gte("school_date", from).lte("school_date", to)
    .order("school_date", { ascending: false }).order("pos").order("id");
  return (data ?? []).map((t: any) => ({
    ...t,
    photos: (t.app_photos ?? []).filter((p: any) => p.active).sort((a: any, b: any) => a.page_no - b.page_no),
  }));
}

export async function signPhotos(tasks: any[]) {
  const paths = tasks.flatMap((t) => t.photos.map((p: any) => p.path));
  if (!paths.length) return;
  const { data } = await db.storage.from("app-photos").createSignedUrls(paths, 3600);
  const m = new Map((data ?? []).map((r: any) => [r.path, r.signedUrl]));
  for (const t of tasks) for (const p of t.photos) p.url = m.get(p.path) ?? null;
}

export function shape(t: any, tz: string) {
  const hm = (iso: string | null) => (iso ? localParts(tz, new Date(iso)).hm : null);
  return {
    id: t.id, kind: t.kind, label: t.title, emoji: t.emoji, light: t.light, needs_photo: t.needs_photo,
    required: t.required, status: t.status, skip_reason: t.skip_reason, accepted: t.accepted,
    done_at: t.done_at, done_hm: hm(t.done_at),
    photos: t.photos.map((p: any) => ({ id: p.id, url: p.url ?? null, at: p.taken_at, page: p.page_no, hm: hm(p.taken_at) })),
  };
}

function doneBy(iso: string | null, tz: string, due: string, hm: string) {
  if (!iso) return false;
  const l = localParts(tz, new Date(iso));
  return l.date < due || (l.date === due && toMin(l.hm) <= toMin(hm));
}

export async function streakStats(fam: any, today: string, S: string) {
  const { data } = await db.from("app_tasks").select("school_date, status, done_at")
    .eq("family_id", fam.id).eq("required", true).gte("school_date", addDays(today, -90)).lte("school_date", S);
  const byDay = new Map<string, any[]>();
  for (const t of data ?? []) {
    if (!byDay.has(t.school_date)) byDay.set(t.school_date, []);
    byDay.get(t.school_date)!.push(t);
  }
  let streak = 0, week = 0, stop = false;
  for (const d of [...byDay.keys()].sort().reverse()) {
    const ts = byDay.get(d)!;
    const complete = ts.every(isDone);
    const last = ts.map((t) => t.done_at).filter(Boolean).sort().pop() ?? null;
    if (d >= addDays(today, -7) && complete && doneBy(last, fam.tz, addDays(d, -1), fam.soft_deadline)) week++;
    if (stop || (d === S && !complete)) continue;
    if (complete && doneBy(last, fam.tz, addDays(d, -1), fam.hard_deadline)) streak++;
    else stop = true;
  }
  return { streak, perfect_week: week };
}

export async function childState(fam: any) {
  const { now, S, due } = await activeDay(fam);
  await ensureTasks(fam, S);
  const tasks = await loadTasks(fam.id, S);
  await signPhotos(tasks);
  const dueToday = due === now.date;
  return {
    name: fam.child_name, school_date: S, school_label: fmtLong(S), due_date: due, due_label: fmtShort(due),
    due_today: dueToday, soft: fam.soft_deadline, hard: fam.hard_deadline, remind_times: fam.remind_times, now_hm: now.hm,
    mins_to_soft: dueToday ? toMin(fam.soft_deadline) - toMin(now.hm) : null,
    mins_to_hard: dueToday ? toMin(fam.hard_deadline) - toMin(now.hm) : null,
    ...(await streakStats(fam, now.date, S)),
    tasks: tasks.map((t) => shape(t, fam.tz)),
  };
}

export async function overview(fam: any) {
  const { now, S } = await activeDay(fam);
  await ensureTasks(fam, S);
  const tasks = await loadTasks(fam.id, addDays(now.date, -14), S);
  await signPhotos(tasks);
  const byDay = new Map<string, any[]>();
  for (const t of tasks) {
    if (!byDay.has(t.school_date)) byDay.set(t.school_date, []);
    byDay.get(t.school_date)!.push(t);
  }
  if (!byDay.has(S)) byDay.set(S, []);
  const days = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([date, ts]) => {
    const req = ts.filter((t) => t.required);
    const last = req.map((t) => t.done_at).filter(Boolean).sort().pop() ?? null;
    return {
      date, label: fmtLong(date), total: req.length, done: req.filter(isDone).length,
      last_done_hm: last ? localParts(fam.tz, new Date(last)).hm : null,
      on_time: req.length > 0 && req.every(isDone) && doneBy(last, fam.tz, addDays(date, -1), fam.soft_deadline),
      tasks: ts.map((t) => shape(t, fam.tz)),
    };
  });
  const { data: off } = await db.from("app_days_off").select("date").eq("family_id", fam.id).gte("date", now.date).order("date");
  return {
    now_hm: now.hm, active: S, days, ...(await streakStats(fam, now.date, S)),
    days_off: (off ?? []).map((o: any) => o.date),
  };
}

async function taskOf(fam: any, id: number) {
  const { data } = await db.from("app_tasks").select("*").eq("id", id).eq("family_id", fam.id).maybeSingle();
  if (!data) throw new HttpError(404, "Задание не найдено");
  return data;
}

export async function checkAllDone(fam: any, S: string) {
  const tasks = await loadTasks(fam.id, S);
  const req = tasks.filter((t) => t.required);
  if (!req.length || req.some((t) => !isDone(t))) return;
  const { error } = await db.from("app_reminder_log").insert({ family_id: fam.id, school_date: S, slot: "all_done" });
  if (error) return;
  const last = req.map((t) => t.done_at).filter(Boolean).sort().pop();
  const when = last ? localParts(fam.tz, new Date(last)).hm : "";
  await notifyParents(fam.id, { title: "🎉 Всё готово", body: `${fam.child_name} всё сделал(а) к ${fmtShort(S)}` },
    { html: `🎉 <b>${esc(fam.child_name)}: всё готово на ${esc(fmtShort(S))}!</b>\nПоследнее задание — в ${when}.` });
}

// Parent actions; also used by the Telegram buttons.
export async function applyAction(fam: any, id: number, action: string): Promise<string> {
  const t = await taskOf(fam, id);
  const name = t.title;
  const clearAllDone = () => db.from("app_reminder_log").delete().eq("family_id", fam.id).eq("school_date", t.school_date).eq("slot", "all_done");
  switch (action) {
    case "ok":
      await db.from("app_tasks").update({ accepted: true }).eq("id", id);
      await notifyChild(fam.id, "👍 Принято", name);
      return `👍 Принято: ${name}`;
    case "done":
      await db.from("app_tasks").update({ status: "done", accepted: true, done_at: new Date().toISOString() }).eq("id", id);
      await checkAllDone(fam, t.school_date);
      return `✅ Отмечено: ${name}`;
    case "redo":
      await db.from("app_tasks").update({ status: "redo", accepted: false, done_at: null }).eq("id", id);
      await db.from("app_photos").update({ active: false }).eq("task_id", id);
      await clearAllDone();
      await notifyChild(fam.id, "🔄 Нужно переснять", `${name}: сфотографируй заново`);
      return `🔄 Попросили переснять: ${name}`;
    case "skip_ok":
      await db.from("app_tasks").update({ status: "skip_ok", accepted: true, done_at: new Date().toISOString() }).eq("id", id);
      await notifyChild(fam.id, "✅ Пропуск одобрен", name);
      await checkAllDone(fam, t.school_date);
      return `✅ Пропуск одобрен: ${name}`;
    case "skip_no":
      await db.from("app_tasks").update({ status: "skip_no", done_at: null }).eq("id", id);
      await notifyChild(fam.id, "❌ Пропуск не одобрен", `${name}: нужно выполнить`);
      return `❌ Пропуск отклонён: ${name}`;
    case "reset":
      await db.from("app_tasks").update({ status: "todo", accepted: false, done_at: null, skip_reason: null }).eq("id", id);
      await db.from("app_photos").update({ active: false }).eq("task_id", id);
      await clearAllDone();
      await notifyChild(fam.id, "↩️ Отметка отменена", `${name}: нужно выполнить заново`);
      return `↩️ Выполнение отменено: ${name}`;
  }
  throw new HttpError(400, "Неизвестное действие");
}

// ---------- child actions ----------
export async function childTask(fam: any, id: number) {
  const { S } = await activeDay(fam);
  const t = await taskOf(fam, id);
  if (t.school_date !== S) throw new HttpError(400, "Это задание не на ближайший учебный день");
  return { t, S };
}

export async function uploadPhoto(fam: any, taskId: number, file: File) {
  if (file.size > 8_000_000) throw new HttpError(413, "Фото слишком большое");
  const { t, S } = await childTask(fam, taskId);
  if (t.status === "skip_ok") throw new HttpError(400, "Пропуск уже одобрен");
  const { count } = await db.from("app_photos").select("id", { count: "exact", head: true }).eq("task_id", taskId).eq("active", true);
  if ((count ?? 0) >= 2) throw new HttpError(400, "Максимум 2 фото");
  const page = (count ?? 0) + 1;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const path = `${fam.id}/${S}/${taskId}-${Date.now()}.jpg`;
  const up = await db.storage.from("app-photos").upload(path, bytes, { contentType: "image/jpeg" });
  if (up.error) throw new HttpError(500, up.error.message);
  await db.from("app_photos").insert({ task_id: taskId, path, page_no: page });
  await db.from("app_tasks").update({ status: "done", accepted: false, done_at: new Date().toISOString(), skip_reason: null }).eq("id", taskId);
  const now = localParts(fam.tz);
  const late = now.date === addDays(S, -1) && toMin(now.hm) > toMin(fam.soft_deadline) ? " ⚠️ после дедлайна" : "";
  await notifyParents(
    fam.id,
    { title: `📸 ${t.emoji} ${t.title}`, body: `Новое фото · стр. ${page}` },
    {
      html: `${esc(t.emoji)} <b>${esc(t.title)}</b> · стр. ${page}\n🕐 ${now.hm} · на ${esc(fmtShort(S))}${late}`,
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
  await db.from("app_tasks").update({ status: "skip_pending", skip_reason: reason }).eq("id", taskId);
  await notifyParents(
    fam.id,
    { title: "🙋 Запрос на пропуск", body: `${t.emoji} ${t.title}: ${reason}` },
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
  await db.from("app_tasks").update(done ? { status: "done", done_at: new Date().toISOString() } : { status: "todo", done_at: null, accepted: false }).eq("id", taskId);
  if (done) await checkAllDone(fam, S);
  else await db.from("app_reminder_log").delete().eq("family_id", fam.id).eq("school_date", S).eq("slot", "all_done");
}
