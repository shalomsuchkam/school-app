-- Vacations: an optional name on a day off («Зимние каникулы»). POST /parent/days-off writes a whole range of
-- dates at once with the same name; the single-day chips leave it null. Additive and safe to run twice.
alter table public.app_days_off add column if not exists note text;
alter table public.app_days_off drop constraint if exists app_days_off_note_chk;
alter table public.app_days_off add constraint app_days_off_note_chk check (note is null or char_length(note) <= 40);
