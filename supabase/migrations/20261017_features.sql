-- Stage 4 features

-- what was assigned (typed by the child or parent) and the parent's comment on the submitted photos
alter table public.app_tasks add column if not exists note text;
alter table public.app_tasks add column if not exists parent_comment text;

-- optional time tracking (parent switches it on): when the child sat down for homework on a school day
alter table public.app_families add column if not exists track_time boolean not null default false;
create table if not exists public.app_sessions (
  family_id uuid not null references public.app_families(id) on delete cascade,
  school_date date not null,
  started_at timestamptz not null default now(),
  primary key (family_id, school_date)
);
alter table public.app_sessions enable row level security;

-- rewards: "N school days in a row on time -> prize"
alter table public.app_families add column if not exists reward_goal int;
alter table public.app_families add column if not exists reward_text text;

-- public holidays of the family's country count as days off unless the parent turns it off
alter table public.app_families add column if not exists auto_holidays boolean not null default true;

-- optional alternating timetable: 0 = every week, 1 = odd ISO weeks, 2 = even ISO weeks
alter table public.app_lessons add column if not exists week_parity smallint not null default 0;
alter table public.app_lessons drop constraint if exists app_lessons_week_parity_chk;
alter table public.app_lessons add constraint app_lessons_week_parity_chk check (week_parity between 0 and 2);

revoke all on table public.app_sessions from anon, authenticated;
alter table public.app_lessons drop constraint if exists app_lessons_pkey;
alter table public.app_lessons add primary key (family_id, weekday, week_parity, pos);
