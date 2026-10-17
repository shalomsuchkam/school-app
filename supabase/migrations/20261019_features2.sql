-- Stage 5 features: home chores, quiet hours, one-day lesson overrides, per-task chat, voice notes, viewer role.
-- Only app_* tables and the app-photos bucket are touched. Safe to run twice.

-- home chores: checklist items are 'school' (homework, packing the bag) or 'home' (chores), with optional minutes;
-- tasks copy both from their item (lessons are always 'school')
alter table public.app_items add column if not exists category text not null default 'school';
alter table public.app_items drop constraint if exists app_items_category_chk;
alter table public.app_items add constraint app_items_category_chk check (category in ('school','home'));
alter table public.app_items add column if not exists duration_min int;
alter table public.app_items drop constraint if exists app_items_duration_chk;
alter table public.app_items add constraint app_items_duration_chk check (duration_min between 1 and 240);

alter table public.app_tasks add column if not exists category text not null default 'school';
alter table public.app_tasks drop constraint if exists app_tasks_category_chk;
alter table public.app_tasks add constraint app_tasks_category_chk check (category in ('school','home'));
alter table public.app_tasks add column if not exists duration_min int;
alter table public.app_tasks drop constraint if exists app_tasks_duration_chk;
alter table public.app_tasks add constraint app_tasks_duration_chk check (duration_min between 1 and 240);

-- the child's voice note on a task (one per task; file in the app-photos bucket, deleted after photo_retention_days)
alter table public.app_tasks add column if not exists voice_path text;
alter table public.app_tasks add column if not exists voice_at timestamptz;
create index if not exists app_tasks_voice_idx on public.app_tasks(family_id, voice_at) where voice_path is not null;

-- quiet hours (family time, HH:MM, may cross midnight): no reminder pushes to the child's phone; both or neither
alter table public.app_families add column if not exists quiet_from text;
alter table public.app_families add column if not exists quiet_to text;
alter table public.app_families drop constraint if exists app_families_quiet_chk;
alter table public.app_families add constraint app_families_quiet_chk check (
  (quiet_from is null) = (quiet_to is null)
  and (quiet_from is null or (quiet_from ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and quiet_to ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'))
);

-- viewer role (tutor/teacher): read-only access, only while the family allows it
alter table public.app_families add column if not exists allow_viewers boolean not null default false;
-- the original inline checks (20261014_app_schema.sql) got Postgres' default names <table>_<column>_check;
-- to be safe, any other check constraint on the role column of these two tables is dropped as well
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass::text as tbl, c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'c' and a.attname = 'role'
      and c.conrelid in ('public.app_devices'::regclass, 'public.app_invites'::regclass)
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;
alter table public.app_devices drop constraint if exists app_devices_role_check;
alter table public.app_devices add constraint app_devices_role_check check (role in ('parent','child','viewer'));
alter table public.app_invites drop constraint if exists app_invites_role_check;
alter table public.app_invites add constraint app_invites_role_check check (role in ('parent','child','viewer'));

-- one-day lesson override: this day's lessons for a child (in this order) instead of the timetable; items unaffected
create table if not exists public.app_day_overrides (
  family_id uuid not null references public.app_families(id) on delete cascade,
  child_id bigint not null references public.app_children(id) on delete cascade,
  date date not null,
  subject_ids bigint[] not null default '{}',
  note text,
  created_at timestamptz not null default now(),
  primary key (child_id, date)
);
alter table public.app_day_overrides drop constraint if exists app_day_overrides_size_chk;
alter table public.app_day_overrides add constraint app_day_overrides_size_chk check (cardinality(subject_ids) <= 14 and char_length(coalesce(note, '')) <= 120);
create index if not exists app_day_overrides_family_idx on public.app_day_overrides(family_id);
alter table public.app_day_overrides enable row level security;
revoke all on table public.app_day_overrides from anon, authenticated;

-- per-task chat between the child and the parents
create table if not exists public.app_messages (
  id bigserial primary key,
  family_id uuid not null references public.app_families(id) on delete cascade,
  task_id bigint not null references public.app_tasks(id) on delete cascade,
  device_id uuid references public.app_devices(id) on delete set null,
  role text not null check (role in ('parent','child')),
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists app_messages_task_idx on public.app_messages(task_id, id);
create index if not exists app_messages_device_idx on public.app_messages(device_id);
create index if not exists app_messages_family_idx on public.app_messages(family_id);
alter table public.app_messages enable row level security;
revoke all on table public.app_messages from anon, authenticated;
revoke all on sequence public.app_messages_id_seq from anon, authenticated;

-- the shared bucket also stores voice notes now (2 MB cap is enforced by the function; the bucket keeps 8 MB for photos)
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'audio/mp4', 'audio/aac', 'audio/mpeg']
where id = 'app-photos';
