-- Store reviewers need reusable credentials. Only the database administrator can
-- opt an invitation in; the public /invite API always creates one-time codes.
-- Use this exclusively for a separate synthetic review family, never a real child.
alter table public.app_invites add column if not exists reusable boolean not null default false;
