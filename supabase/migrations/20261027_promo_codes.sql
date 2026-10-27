-- Promo codes for free access. The owner creates codes (POST /admin/promo or deploy/lite/promo.sh on the server);
-- a parent redeems one (POST /parent/promo). Only new app_* tables and functions; nothing else is touched.
-- Safe to run twice.

-- code: A–Z and 2–9 without the look-alikes 0/O and 1/I, 6–16 characters (the invite-code alphabet)
-- days: access added per redemption; null = forever (free_forever)
create table if not exists public.app_promo_codes (
  code text primary key,
  days int,
  max_uses int not null default 1,
  used int not null default 0,
  expires_at timestamptz,                       -- the code can't be redeemed after this moment (null = never)
  note text,                                    -- the owner's own memo: who it was for
  created_at timestamptz not null default now()
);
alter table public.app_promo_codes drop constraint if exists app_promo_codes_code_chk;
alter table public.app_promo_codes add constraint app_promo_codes_code_chk check (code ~ '^[A-HJ-NP-Z2-9]{6,16}$');
alter table public.app_promo_codes drop constraint if exists app_promo_codes_days_chk;
alter table public.app_promo_codes add constraint app_promo_codes_days_chk check (days is null or days between 1 and 3650);
alter table public.app_promo_codes drop constraint if exists app_promo_codes_uses_chk;
alter table public.app_promo_codes add constraint app_promo_codes_uses_chk check (max_uses between 1 and 100000 and used between 0 and max_uses);
alter table public.app_promo_codes enable row level security;
revoke all on table public.app_promo_codes from anon, authenticated;

-- one row per family that used a code; a family can use each code once. Deleting the family deletes its rows
-- (the code's `used` counter stays, so a deleted-and-recreated family can't refill a code).
create table if not exists public.app_promo_redemptions (
  code text not null references public.app_promo_codes(code) on delete cascade,
  family_id uuid not null references public.app_families(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (code, family_id)
);
create index if not exists app_promo_redemptions_family_idx on public.app_promo_redemptions(family_id);
alter table public.app_promo_redemptions enable row level security;
revoke all on table public.app_promo_redemptions from anon, authenticated;

-- Redeem atomically. Returns 'ok' | 'not_found' | 'expired' | 'used'.
-- The code row is locked (for update): concurrent redemptions of one code run one after another, so `used` never
-- passes max_uses; the primary key above is the second guard against one family redeeming twice.
-- Access: days = null -> free_forever; otherwise granted_until = greatest(now, granted_until) + days
-- (an unexpired grant is extended, an expired one starts from now). paid_until (the store's) is not touched.
create or replace function public.app_promo_redeem(p_code text, p_family uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  pc public.app_promo_codes%rowtype;
begin
  select * into pc from public.app_promo_codes where code = p_code for update;
  if not found then return 'not_found'; end if;
  if pc.expires_at is not null and pc.expires_at <= now() then return 'expired'; end if;
  if pc.used >= pc.max_uses then return 'used'; end if;
  insert into public.app_promo_redemptions (code, family_id) values (p_code, p_family) on conflict do nothing;
  if not found then return 'used'; end if;
  update public.app_families
     set free_forever = free_forever or pc.days is null,
         granted_until = case when pc.days is null then granted_until
                              else greatest(now(), granted_until) + make_interval(days => pc.days) end
   where id = p_family;
  if not found then raise exception 'app_promo_redeem: family % not found', p_family; end if;
  update public.app_promo_codes set used = used + 1 where code = p_code;
  return 'ok';
end $$;
revoke all on function public.app_promo_redeem(text, uuid) from public, anon, authenticated;
grant execute on function public.app_promo_redeem(text, uuid) to service_role;

-- Create a code; returns it. p_code null = a random 10-character code (gen_random_uuid's random bytes; a clash
-- with an existing code is retried). A given p_code that already exists raises unique_violation (23505).
create or replace function public.app_promo_create(
  p_days int default null, p_max_uses int default 1, p_expires timestamptz default null, p_note text default null, p_code text default null
) returns text language plpgsql security definer set search_path = public as $$
declare
  alpha constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text;
begin
  if p_code is not null then
    c := upper(regexp_replace(p_code, '[[:space:]_.-]', '', 'g'));
    insert into public.app_promo_codes (code, days, max_uses, expires_at, note)
    values (c, p_days, coalesce(p_max_uses, 1), p_expires, nullif(btrim(p_note), ''));
    return c;
  end if;
  for attempt in 1..20 loop
    -- 32 symbols: a random byte mod 32 is uniform
    select string_agg(substr(alpha, 1 + get_byte(uuid_send(gen_random_uuid()), 0) % 32, 1), '') into c from generate_series(1, 10);
    begin
      insert into public.app_promo_codes (code, days, max_uses, expires_at, note)
      values (c, p_days, coalesce(p_max_uses, 1), p_expires, nullif(btrim(p_note), ''));
      return c;
    exception when unique_violation then
      null; -- try another code
    end;
  end loop;
  raise exception 'app_promo_create: no free code after 20 attempts';
end $$;
revoke all on function public.app_promo_create(int, int, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.app_promo_create(int, int, timestamptz, text, text) to service_role;
