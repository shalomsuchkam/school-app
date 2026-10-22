-- Runs as postgres before the pending app migrations, on every install/deploy (idempotent).
-- psql variable: fn_url = https://<API_DOMAIN>/functions/v1/app
--
-- Cloud-specific bits of supabase/migrations handled here instead of editing the migration files:
--  * public.app_secrets is used by 20261014 but was never created by a migration (it predates them in the cloud
--    project). Same shape here: key/value text.
--  * 20261014 seeds app_fn_url with the cloud URL "on conflict do nothing". Seeding our public URL first means the
--    cloud URL never lands in this database (invite links and anything else reading app_fn_url use this server).

create table if not exists public.app_secrets (
  key text primary key,
  value text not null
);
alter table public.app_secrets enable row level security;
revoke all on table public.app_secrets from anon, authenticated;

insert into public.app_secrets (key, value) values ('app_fn_url', :'fn_url')
on conflict (key) do update set value = excluded.value;
