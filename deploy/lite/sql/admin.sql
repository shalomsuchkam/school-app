-- Runs as supabase_admin before the app migrations, on every install/deploy (idempotent).
-- Things Supabase Cloud already has and the migrations take for granted.

-- 20261014_app_schema.sql calls cron.schedule / net.http_post (both preloaded in the supabase/postgres image)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Bookkeeping of applied migration files. Deliberately NOT public.app_*: backups and migrate-from-cloud
-- handle exactly the public.app_* tables, this one must survive them.
create schema if not exists uroki_meta authorization postgres;
create table if not exists uroki_meta.migrations (
  name text primary key,
  sha256 text not null,
  applied_at timestamptz not null default now()
);
alter table uroki_meta.migrations owner to postgres;
revoke all on schema uroki_meta from public;

-- The private photo/voice bucket (Cloud: created in the dashboard / by 20261014). Never public.
insert into storage.buckets (id, name, public) values ('app-photos', 'app-photos', false)
on conflict (id) do update set public = false;
-- the migrations (run as postgres, as in the cloud) adjust the bucket's size/mime limits
grant select, insert, update on storage.buckets to postgres;
