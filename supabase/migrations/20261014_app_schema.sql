-- Multi-family backend for the mobile app. Separate app_* tables: the web app / bot tables are untouched.
create table if not exists public.app_families (
  id uuid primary key default gen_random_uuid(),
  child_name text not null default 'Ученик',
  tz text not null default 'Asia/Almaty',
  school_weekdays int[] not null default '{1,2,3,4,5}',
  soft_deadline text not null default '17:30',
  hard_deadline text not null default '22:00',
  remind_times text[] not null default '{14:30,15:45,16:45,19:00,20:30,21:30}',
  created_at timestamptz not null default now()
);

create table if not exists public.app_devices (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.app_families(id) on delete cascade,
  role text not null check (role in ('parent','child')),
  name text,
  token_hash text not null unique,
  push_token text,
  tg_chat_id bigint,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index if not exists app_devices_family on public.app_devices(family_id);

create table if not exists public.app_invites (
  code text primary key,
  family_id uuid not null references public.app_families(id) on delete cascade,
  role text not null check (role in ('parent','child')),
  expires_at timestamptz not null
);

create table if not exists public.app_subjects (
  id bigserial primary key,
  family_id uuid not null references public.app_families(id) on delete cascade,
  name text not null,
  emoji text not null default '📘',
  light boolean not null default false,          -- usually no homework (PE, music…)
  created_at timestamptz not null default now()
);
create index if not exists app_subjects_family on public.app_subjects(family_id);

create table if not exists public.app_lessons (
  family_id uuid not null references public.app_families(id) on delete cascade,
  weekday int not null check (weekday between 1 and 7),
  pos int not null,
  subject_id bigint not null references public.app_subjects(id) on delete cascade,
  primary key (family_id, weekday, pos)
);

create table if not exists public.app_items (
  id bigserial primary key,
  family_id uuid not null references public.app_families(id) on delete cascade,
  title text not null,
  emoji text not null default '✅',
  required boolean not null default true,
  needs_photo boolean not null default true,
  weekdays int[],                                -- null = every school day
  pos int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists app_items_family on public.app_items(family_id);

create table if not exists public.app_days_off (
  family_id uuid not null references public.app_families(id) on delete cascade,
  date date not null,
  primary key (family_id, date)
);

create table if not exists public.app_tasks (
  id bigserial primary key,
  family_id uuid not null references public.app_families(id) on delete cascade,
  school_date date not null,
  kind text not null check (kind in ('lesson','item')),
  ref_id bigint not null,
  title text not null,
  emoji text not null,
  light boolean not null default false,
  needs_photo boolean not null default true,
  pos int not null default 0,
  required boolean not null default true,
  status text not null default 'todo' check (status in ('todo','done','redo','skip_pending','skip_ok','skip_no')),
  skip_reason text,
  accepted boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  unique (family_id, school_date, kind, ref_id)
);
create index if not exists app_tasks_day on public.app_tasks(family_id, school_date);

create table if not exists public.app_photos (
  id bigserial primary key,
  task_id bigint not null references public.app_tasks(id) on delete cascade,
  path text not null,
  page_no int not null default 1,
  active boolean not null default true,
  taken_at timestamptz not null default now()
);
create index if not exists app_photos_task on public.app_photos(task_id);

create table if not exists public.app_reminder_log (
  family_id uuid not null references public.app_families(id) on delete cascade,
  school_date date not null,
  slot text not null,
  sent_at timestamptz not null default now(),
  primary key (family_id, school_date, slot)
);

create table if not exists public.app_tg_links (
  code text primary key,
  device_id uuid not null references public.app_devices(id) on delete cascade,
  expires_at timestamptz not null
);

alter table public.app_families enable row level security;
alter table public.app_devices enable row level security;
alter table public.app_invites enable row level security;
alter table public.app_subjects enable row level security;
alter table public.app_lessons enable row level security;
alter table public.app_items enable row level security;
alter table public.app_days_off enable row level security;
alter table public.app_tasks enable row level security;
alter table public.app_photos enable row level security;
alter table public.app_reminder_log enable row level security;
alter table public.app_tg_links enable row level security;

insert into storage.buckets (id, name, public) values ('app-photos', 'app-photos', false) on conflict do nothing;

insert into public.app_secrets (key, value) values
  ('app_cron_key', replace(gen_random_uuid()::text,'-','')),
  ('app_tg_secret', replace(gen_random_uuid()::text,'-','')),
  ('app_fn_url', 'https://cmranrfjvvmhktntbnpg.supabase.co/functions/v1/app')
on conflict do nothing;

select cron.schedule('app-tick', '*/5 * * * *', $$
  select net.http_post(
    url := (select value from public.app_secrets where key = 'app_fn_url') || '/tick',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-key',(select value from public.app_secrets where key = 'app_cron_key')),
    body := '{}'::jsonb
  )
$$);
