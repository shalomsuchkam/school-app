-- Several children per family. Each child has a timetable and daily tasks; subjects are shared by the family,
-- checklist items can be for everyone (child_id null) or one child. Existing families get one child each.
create table if not exists public.app_children (
  id bigserial primary key,
  family_id uuid not null references public.app_families(id) on delete cascade,
  name text not null,
  pos int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.app_children enable row level security;
revoke all on table public.app_children from anon, authenticated;
create index if not exists app_children_family_idx on public.app_children(family_id);

insert into public.app_children (family_id, name)
select f.id, f.child_name from public.app_families f
where not exists (select 1 from public.app_children c where c.family_id = f.id);

-- which child a child device is; which child an invite is for
alter table public.app_devices add column if not exists child_id bigint references public.app_children(id) on delete cascade;
alter table public.app_invites add column if not exists child_id bigint references public.app_children(id) on delete cascade;
update public.app_devices d set child_id = (select min(c.id) from public.app_children c where c.family_id = d.family_id)
where d.role = 'child' and d.child_id is null;

-- lessons and tasks belong to a child
alter table public.app_lessons add column if not exists child_id bigint references public.app_children(id) on delete cascade;
update public.app_lessons l set child_id = (select min(c.id) from public.app_children c where c.family_id = l.family_id) where l.child_id is null;
alter table public.app_lessons alter column child_id set not null;
alter table public.app_lessons drop constraint if exists app_lessons_pkey;
alter table public.app_lessons add primary key (child_id, weekday, week_parity, pos);

alter table public.app_items add column if not exists child_id bigint references public.app_children(id) on delete cascade;

alter table public.app_tasks add column if not exists child_id bigint references public.app_children(id) on delete cascade;
update public.app_tasks t set child_id = (select min(c.id) from public.app_children c where c.family_id = t.family_id) where t.child_id is null;
alter table public.app_tasks alter column child_id set not null;
alter table public.app_tasks drop constraint if exists app_tasks_family_id_school_date_kind_ref_id_key;
alter table public.app_tasks add constraint app_tasks_child_day_ref_key unique (child_id, school_date, kind, ref_id);
create index if not exists app_tasks_family_date_idx on public.app_tasks(family_id, school_date);

alter table public.app_sessions add column if not exists child_id bigint references public.app_children(id) on delete cascade;
update public.app_sessions s set child_id = (select min(c.id) from public.app_children c where c.family_id = s.family_id) where s.child_id is null;
alter table public.app_sessions alter column child_id set not null;
alter table public.app_sessions drop constraint if exists app_sessions_pkey;
alter table public.app_sessions add primary key (child_id, school_date);
