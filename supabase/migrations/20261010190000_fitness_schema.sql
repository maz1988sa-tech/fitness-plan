-- Fitness plan: schema, roles and row-level security.
-- Roles are deny-by-default and enforced here, not in the page:
--   owner  = reads and writes own rows
--   viewer = reads only (e.g. a coach)
-- Every new account starts as an INACTIVE viewer; an admin activates it explicitly.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------- profiles and role helpers
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner', 'viewer')),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'One row per account. New accounts start inactive with the viewer role; activation is an admin action.';

create or replace function private.is_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.active from public.profiles p where p.id = (select auth.uid())), false);
$$;

create or replace function private.has_role(r text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active and p.role = r);
$$;

revoke all on function private.is_active() from public, anon;
revoke all on function private.has_role(text) from public, anon;
grant execute on function private.is_active() to authenticated;
grant execute on function private.has_role(text) to authenticated;

create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;
revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Accounts that already exist get an inactive viewer profile too.
insert into public.profiles (id) select id from auth.users on conflict (id) do nothing;

create or replace function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------- plan (written by the admin, read by active members)
create table public.plan_versions (
  id bigint generated always as identity primary key,
  version int not null unique,
  title text not null,
  is_current boolean not null default false,
  plan jsonb not null check (jsonb_typeof(plan) = 'object'),
  doc_markdown text,
  source text,
  change_note text,
  created_at timestamptz not null default now()
);
create unique index plan_versions_single_current on public.plan_versions (is_current) where is_current;
comment on table public.plan_versions is 'Versioned plan: structured JSON for the app plus the full document text. Exactly one row is current.';

-- ---------------------------------------------------------------- daily log
create table public.daily_logs (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  log_date date not null,
  weight_kg numeric(5, 2) check (weight_kg between 30 and 250),
  waist_cm numeric(5, 1) check (waist_cm between 40 and 200),
  sleep_h numeric(3, 1) check (sleep_h between 0 and 24),
  resting_hr smallint check (resting_hr between 25 and 150),
  water_l numeric(4, 2) check (water_l between 0 and 15),
  steps int check (steps between 0 and 100000),
  kcal int check (kcal between 0 and 10000),
  protein_g int check (protein_g between 0 and 600),
  hunger smallint check (hunger between 1 and 5),
  adherent boolean,
  meals jsonb not null default '{}'::jsonb,
  creatine boolean,
  cardio_min smallint check (cardio_min between 0 and 600),
  cardio_mode text check (char_length(cardio_mode) <= 40),
  test_hr smallint check (test_hr between 40 and 220),
  shoulder_pain smallint check (shoulder_pain between 0 and 10),
  photos_done boolean,
  notes text check (char_length(notes) <= 2000),
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, log_date)
);

-- ---------------------------------------------------------------- training
create table public.workout_sessions (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_date date not null,
  session_key text not null check (session_key ~ '^[a-z_]{2,20}$'),
  week_no smallint check (week_no between -10 and 60),
  started_at timestamptz,
  finished_at timestamptz,
  shoulder_pain smallint check (shoulder_pain between 0 and 10),
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, session_date, session_key)
);

create table public.workout_sets (
  user_id uuid not null default auth.uid(),
  session_date date not null,
  session_key text not null,
  exercise_key text not null check (exercise_key ~ '^[a-z0-9_.]{3,60}$'),
  set_no smallint not null check (set_no between 1 and 20),
  variant text not null default 'main' check (variant in ('main', 'alt')),
  weight_kg numeric(6, 2) check (weight_kg between 0 and 1000),
  reps smallint check (reps between 0 and 100),
  rir smallint check (rir between 0 and 10),
  done boolean not null default true,
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, session_date, session_key, exercise_key, set_no),
  foreign key (user_id, session_date, session_key)
    references public.workout_sessions (user_id, session_date, session_key) on delete cascade
);

-- ---------------------------------------------------------------- body composition (InBody)
create table public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  measured_on date not null,
  source text not null default 'inbody' check (source in ('inbody', 'home_scale', 'other')),
  device text check (char_length(device) <= 80),
  weight_kg numeric(5, 2) check (weight_kg between 30 and 250),
  smm_kg numeric(5, 2) check (smm_kg between 5 and 120),
  bfm_kg numeric(5, 2) check (bfm_kg between 1 and 150),
  pbf numeric(4, 1) check (pbf between 2 and 70),
  ffm_kg numeric(5, 2) check (ffm_kg between 20 and 200),
  tbw_l numeric(5, 2) check (tbw_l between 10 and 120),
  visceral_level smallint check (visceral_level between 1 and 30),
  bmr_kcal int check (bmr_kcal between 500 and 5000),
  inbody_score smallint check (inbody_score between 0 and 120),
  notes text check (char_length(notes) <= 2000),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, measured_on, source)
);

-- ---------------------------------------------------------------- updated_at triggers
create trigger profiles_touch before update on public.profiles for each row execute function private.touch_updated_at();
create trigger daily_logs_touch before update on public.daily_logs for each row execute function private.touch_updated_at();
create trigger workout_sessions_touch before update on public.workout_sessions for each row execute function private.touch_updated_at();
create trigger workout_sets_touch before update on public.workout_sets for each row execute function private.touch_updated_at();
create trigger body_measurements_touch before update on public.body_measurements for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------- row-level security (deny unless granted below)
alter table public.profiles enable row level security;
alter table public.plan_versions enable row level security;
alter table public.daily_logs enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.workout_sets enable row level security;
alter table public.body_measurements enable row level security;

create policy "profiles: read own row" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create policy "plan: active members read" on public.plan_versions
  for select to authenticated using ((select private.is_active()));

do $$
declare t text;
begin
  foreach t in array array['daily_logs', 'workout_sessions', 'workout_sets', 'body_measurements'] loop
    execute format('create policy "%1$s: active members read" on public.%1$I for select to authenticated using ((select private.is_active()))', t);
    execute format('create policy "%1$s: owner inserts own rows" on public.%1$I for insert to authenticated with check (user_id = (select auth.uid()) and (select private.has_role(''owner'')))', t);
    execute format('create policy "%1$s: owner updates own rows" on public.%1$I for update to authenticated using (user_id = (select auth.uid()) and (select private.has_role(''owner''))) with check (user_id = (select auth.uid()) and (select private.has_role(''owner'')))', t);
    execute format('create policy "%1$s: owner deletes own rows" on public.%1$I for delete to authenticated using (user_id = (select auth.uid()) and (select private.has_role(''owner'')))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- table privileges: anon gets nothing, signed-in users only what the app uses
revoke all on public.profiles, public.plan_versions, public.daily_logs, public.workout_sessions, public.workout_sets, public.body_measurements from anon;
revoke all on public.profiles, public.plan_versions, public.daily_logs, public.workout_sessions, public.workout_sets, public.body_measurements from authenticated;
grant select on public.profiles, public.plan_versions to authenticated;
grant select, insert, update, delete on public.daily_logs, public.workout_sessions, public.workout_sets, public.body_measurements to authenticated;
