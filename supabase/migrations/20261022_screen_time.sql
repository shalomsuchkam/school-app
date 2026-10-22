-- Stage 6: screen time (parental controls on the child's phone) and textbook links. docs/SCREEN_TIME.md.
-- Only new app_* tables are created; nothing else is touched. Safe to run twice.
-- Every table hangs off app_families / app_children / app_devices with on delete cascade, so deleting a family
-- (DELETE /family), a child (DELETE /children/:id) or a device removes its rows here too.

-- one row per child; no row = rules off (the API returns the defaults)
create table if not exists public.app_screen_rules (
  child_id bigint primary key references public.app_children(id) on delete cascade,
  family_id uuid not null references public.app_families(id) on delete cascade,
  enabled boolean not null default false,
  enabled_at timestamptz,                       -- last switch to enabled: apps installed later count as new
  daily_limit_min int,
  app_limits jsonb not null default '[]',       -- [{pkg, name, minutes}]
  blocked_apps text[] not null default '{}',
  always_allowed text[] not null default '{}',
  bedtime jsonb,                                -- {from, to, allowed[]} | null
  school jsonb,                                 -- {from, to, days[], allowed[]} | null
  homework_lock boolean not null default false,
  homework_lock_from text not null default '15:00',
  block_new_apps boolean not null default false,
  unlock_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.app_screen_rules drop constraint if exists app_screen_rules_limit_chk;
alter table public.app_screen_rules add constraint app_screen_rules_limit_chk check (daily_limit_min between 1 and 1440);
alter table public.app_screen_rules drop constraint if exists app_screen_rules_lock_from_chk;
alter table public.app_screen_rules add constraint app_screen_rules_lock_from_chk check (homework_lock_from ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
alter table public.app_screen_rules drop constraint if exists app_screen_rules_lists_chk;
alter table public.app_screen_rules add constraint app_screen_rules_lists_chk check (
  cardinality(blocked_apps) <= 200 and cardinality(always_allowed) <= 200
  and array_to_string(blocked_apps, ',') ~ '^[A-Za-z0-9._,]*$'
  and array_to_string(always_allowed, ',') ~ '^[A-Za-z0-9._,]*$'
);
alter table public.app_screen_rules drop constraint if exists app_screen_rules_app_limits_chk;
alter table public.app_screen_rules add constraint app_screen_rules_app_limits_chk check (
  jsonb_typeof(app_limits) = 'array' and jsonb_array_length(app_limits) <= 100
);
alter table public.app_screen_rules drop constraint if exists app_screen_rules_bedtime_chk;
alter table public.app_screen_rules add constraint app_screen_rules_bedtime_chk check (
  bedtime is null or (
    jsonb_typeof(bedtime) = 'object'
    and coalesce(bedtime->>'from', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    and coalesce(bedtime->>'to', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  )
);
alter table public.app_screen_rules drop constraint if exists app_screen_rules_school_chk;
alter table public.app_screen_rules add constraint app_screen_rules_school_chk check (
  school is null or (
    jsonb_typeof(school) = 'object'
    and coalesce(school->>'from', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    and coalesce(school->>'to', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    and jsonb_typeof(school->'days') = 'array'
  )
);
create index if not exists app_screen_rules_family_idx on public.app_screen_rules(family_id);
alter table public.app_screen_rules enable row level security;
revoke all on table public.app_screen_rules from anon, authenticated;

-- the latest report of each child device (installed apps, today's usage, guard permissions)
create table if not exists public.app_screen_reports (
  device_id uuid primary key references public.app_devices(id) on delete cascade,
  family_id uuid not null references public.app_families(id) on delete cascade,
  child_id bigint not null references public.app_children(id) on delete cascade,
  apps jsonb not null default '[]',             -- [{pkg, name, installed_at}]
  usage jsonb not null default '{}',            -- {date, total_min, apps: {pkg: minutes}}
  guard jsonb not null default '{}',            -- {usage_access, overlay, admin, battery_ok, running}
  reported_at timestamptz not null default now()
);
alter table public.app_screen_reports drop constraint if exists app_screen_reports_shape_chk;
alter table public.app_screen_reports add constraint app_screen_reports_shape_chk check (
  jsonb_typeof(apps) = 'array' and jsonb_array_length(apps) <= 500
  and jsonb_typeof(usage) = 'object' and jsonb_typeof(guard) = 'object'
);
create index if not exists app_screen_reports_child_idx on public.app_screen_reports(child_id, reported_at desc);
create index if not exists app_screen_reports_family_idx on public.app_screen_reports(family_id);
alter table public.app_screen_reports enable row level security;
revoke all on table public.app_screen_reports from anon, authenticated;

-- every package a child's phone has reported: new-app detection (one parent notification per package) and approval
create table if not exists public.app_screen_seen (
  child_id bigint not null references public.app_children(id) on delete cascade,
  family_id uuid not null references public.app_families(id) on delete cascade,
  pkg text not null,
  name text,
  first_seen timestamptz not null default now(),
  approved boolean not null default false,
  primary key (child_id, pkg)
);
alter table public.app_screen_seen drop constraint if exists app_screen_seen_pkg_chk;
alter table public.app_screen_seen add constraint app_screen_seen_pkg_chk check (
  pkg ~ '^[A-Za-z0-9._]+$' and char_length(pkg) <= 200 and char_length(coalesce(name, '')) <= 80
);
create index if not exists app_screen_seen_family_idx on public.app_screen_seen(family_id);
create index if not exists app_screen_seen_pending_idx on public.app_screen_seen(child_id) where not approved;
alter table public.app_screen_seen enable row level security;
revoke all on table public.app_screen_seen from anon, authenticated;

-- textbook links the parent adds (for one child, or for every child when child_id is null); PDFs stay on the phone
create table if not exists public.app_textbooks (
  id bigserial primary key,
  family_id uuid not null references public.app_families(id) on delete cascade,
  child_id bigint references public.app_children(id) on delete cascade,
  title text not null,
  url text not null,
  created_at timestamptz not null default now()
);
alter table public.app_textbooks drop constraint if exists app_textbooks_chk;
alter table public.app_textbooks add constraint app_textbooks_chk check (
  char_length(title) between 1 and 80 and char_length(url) <= 500 and url ~* '^https?://'
);
create index if not exists app_textbooks_family_idx on public.app_textbooks(family_id, id);
create index if not exists app_textbooks_child_idx on public.app_textbooks(child_id);
alter table public.app_textbooks enable row level security;
revoke all on table public.app_textbooks from anon, authenticated;
revoke all on sequence public.app_textbooks_id_seq from anon, authenticated;
