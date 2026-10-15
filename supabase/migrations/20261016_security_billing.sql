-- Stage 1: security hardening, data retention, consent, subscription state.

-- family settings
alter table public.app_families add column if not exists photo_retention_days int not null default 30;
alter table public.app_families drop constraint if exists app_families_retention_chk;
alter table public.app_families add constraint app_families_retention_chk check (photo_retention_days between 7 and 40);
alter table public.app_families add column if not exists country text not null default 'KZ';
alter table public.app_families add column if not exists lang text not null default 'ru';
alter table public.app_families add column if not exists consent_at timestamptz;
alter table public.app_families add column if not exists consent_version text;

-- subscription: access while paid_until is in the future (store trial included) or free_forever (granted by the owner only)
alter table public.app_families add column if not exists paid_until timestamptz;
alter table public.app_families add column if not exists free_forever boolean not null default false;
alter table public.app_families add column if not exists billing_store text;
alter table public.app_families add column if not exists billing_period text;

-- one store/device identity can start a trial only once, whatever family it later belongs to
create table if not exists public.app_trial_claims (
  claim text primary key,
  family_id uuid,
  created_at timestamptz not null default now()
);
alter table public.app_trial_claims enable row level security;

-- fixed-window rate limiter (only the edge function, via service role, calls it)
create table if not exists public.app_rate (
  key text primary key,
  n int not null,
  reset_at timestamptz not null
);
alter table public.app_rate enable row level security;

create or replace function public.app_rate_hit(k text, lim int, win_sec int)
returns boolean language plpgsql security definer set search_path = public as $$
declare cur int;
begin
  insert into app_rate as r (key, n, reset_at) values (k, 1, now() + make_interval(secs => win_sec))
  on conflict (key) do update
    set n = case when r.reset_at < now() then 1 else r.n + 1 end,
        reset_at = case when r.reset_at < now() then now() + make_interval(secs => win_sec) else r.reset_at end
  returning n into cur;
  return cur <= lim;
end $$;
revoke all on function public.app_rate_hit(text, int, int) from public, anon, authenticated;

-- least privilege: clients never talk to these tables directly (RLS already denies; drop the grants too)
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename like 'app\_%' loop
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;

-- photo bucket limits
update storage.buckets set file_size_limit = 8000000, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'] where id = 'app-photos';

-- short family code shown in Settings; the owner grants free access by this code
alter table public.app_families add column if not exists code text;
update public.app_families set code = upper(substr(md5(id::text || random()::text), 1, 8)) where code is null;
alter table public.app_families alter column code set default upper(substr(md5(random()::text), 1, 8));
alter table public.app_families alter column code set not null;
create unique index if not exists app_families_code_key on public.app_families(code);

-- owner-granted access for N days, kept apart from store-managed paid_until (which RevenueCat sync overwrites)
alter table public.app_families add column if not exists granted_until timestamptz;
