-- Undo for parent actions: snapshot of the task before the last ok/done/redo/skip_ok/skip_no
-- {action, status, accepted, done_at, skip_reason, photo_ids, after_status, after_accepted}.
-- Written and cleared by the `app` edge function (applyAction in supabase/functions/app/core.ts).
alter table public.app_tasks add column if not exists undo jsonb;
