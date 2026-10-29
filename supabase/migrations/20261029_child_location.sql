-- Stage 7: child location (where is my child). docs/LOCATION.md.
-- Only new app_* tables are created; nothing else is touched. Safe to run twice.
-- Both tables hang off app_families / app_children / app_devices with on delete cascade, so deleting a family
-- (DELETE /family), a child (DELETE /children/:id) or a device removes its rows here too.

-- The latest known position of each child device, plus the anti-tamper state the phone reports with every ping
-- (whether location services are on and what permission the app holds). The server compares each ping with the
-- row it replaces to notify the parent the moment a child turns location off or the permission is revoked.
create table if not exists public.app_locations (
  device_id uuid primary key references public.app_devices(id) on delete cascade,
  family_id uuid not null references public.app_families(id) on delete cascade,
  child_id bigint not null references public.app_children(id) on delete cascade,
  lat double precision,                          -- null until the first fix (services off from the start)
  lng double precision,
  accuracy real,                                 -- metres; smaller is better
  battery smallint,                              -- 0..100, null if unknown
  moving boolean not null default false,         -- the phone was moving when it reported (denser pings)
  services_on boolean not null default true,     -- device location master switch
  perm text not null default 'unknown',          -- 'always' | 'while' | 'denied' | 'unknown'
  fix_at timestamptz,                            -- device clock at the fix (may lag the server clock)
  reported_at timestamptz not null default now() -- when the server received this ping
);
alter table public.app_locations drop constraint if exists app_locations_perm_chk;
alter table public.app_locations add constraint app_locations_perm_chk check (perm in ('always', 'while', 'denied', 'unknown'));
alter table public.app_locations drop constraint if exists app_locations_coord_chk;
alter table public.app_locations add constraint app_locations_coord_chk check (
  (lat is null and lng is null) or (lat between -90 and 90 and lng between -180 and 180)
);
alter table public.app_locations drop constraint if exists app_locations_battery_chk;
alter table public.app_locations add constraint app_locations_battery_chk check (battery is null or battery between 0 and 100);
create index if not exists app_locations_child_idx on public.app_locations(child_id, reported_at desc);
create index if not exists app_locations_family_idx on public.app_locations(family_id);
alter table public.app_locations enable row level security;
revoke all on table public.app_locations from anon, authenticated;

-- A bounded breadcrumb trail: the recent positions a parent can scroll back through. Kept small — the API trims
-- each child to the newest LOCATION_TRAIL rows on write, and old rows cascade away with the family/child/device.
create table if not exists public.app_location_log (
  id bigserial primary key,
  device_id uuid not null references public.app_devices(id) on delete cascade,
  family_id uuid not null references public.app_families(id) on delete cascade,
  child_id bigint not null references public.app_children(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  accuracy real,
  fix_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.app_location_log drop constraint if exists app_location_log_coord_chk;
alter table public.app_location_log add constraint app_location_log_coord_chk check (lat between -90 and 90 and lng between -180 and 180);
create index if not exists app_location_log_child_idx on public.app_location_log(child_id, id desc);
create index if not exists app_location_log_family_idx on public.app_location_log(family_id);
alter table public.app_location_log enable row level security;
revoke all on table public.app_location_log from anon, authenticated;
revoke all on sequence public.app_location_log_id_seq from anon, authenticated;

-- Whether a family turned child-location tracking on, and when (so freshly installed child phones know to start).
alter table public.app_children add column if not exists track_location boolean not null default false;
