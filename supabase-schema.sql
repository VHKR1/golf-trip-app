-- Golf Trip Pro database schema for Supabase/Postgres
-- Store source data only. Leaderboards and points should be computed from these tables.

create extension if not exists pgcrypto;

create table trips (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create type trip_role as enum ('owner', 'admin', 'player');

create table trip_memberships (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role trip_role not null default 'player',
  player_id uuid,
  unique (trip_id, user_id)
);

create table players (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  name text not null,
  handicap numeric,
  active boolean not null default true
);

alter table trip_memberships
  add constraint trip_memberships_player_id_fkey
  foreign key (player_id) references players(id);

create table courses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  name text not null
);

create table course_holes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  hole_number int not null check (hole_number between 1 and 18),
  par int not null check (par between 3 and 6),
  unique (course_id, hole_number)
);

create type round_state as enum ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETE');
create type game_mode as enum ('SCRAMBLE', 'MATCH_PLAY', 'STABLEFORD');

create table rounds (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  course_id uuid not null references courses(id),
  name text not null,
  game_mode game_mode not null,
  clutch_enabled boolean not null default true,
  clutch_hole int not null check (clutch_hole between 1 and 18),
  longest_drive_hole int not null check (longest_drive_hole between 1 and 18),
  nearest_pin_hole int not null check (nearest_pin_hole between 1 and 18),
  status round_state not null default 'NOT_STARTED',
  locked boolean not null default false,
  updated_at timestamptz not null default now()
);

create table round_entries (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  position int not null,
  scorer_player_id uuid references players(id),
  submitted_by uuid references auth.users(id),
  submitted_at timestamptz,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  unique (round_id, position)
);

create table round_entry_players (
  id uuid primary key default gen_random_uuid(),
  round_entry_id uuid not null references round_entries(id) on delete cascade,
  player_id uuid not null references players(id),
  unique (round_entry_id, player_id)
);

create table scores (
  id uuid primary key default gen_random_uuid(),
  round_entry_id uuid not null references round_entries(id) on delete cascade,
  hole_number int not null check (hole_number between 1 and 18),
  strokes int not null check (strokes between 1 and 12),
  updated_at timestamptz not null default now(),
  unique (round_entry_id, hole_number)
);

create type award_type as enum ('LONGEST_DRIVE', 'NEAREST_PIN');

create table awards (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  type award_type not null,
  player_id uuid not null references players(id),
  unique (round_id, type)
);

alter table trips enable row level security;
alter table trip_memberships enable row level security;
alter table players enable row level security;
alter table courses enable row level security;
alter table course_holes enable row level security;
alter table rounds enable row level security;
alter table round_entries enable row level security;
alter table round_entry_players enable row level security;
alter table scores enable row level security;
alter table awards enable row level security;

create or replace function is_trip_member(target_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from trip_memberships
    where trip_id = target_trip_id
      and user_id = auth.uid()
  );
$$;

create or replace function is_trip_admin(target_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from trip_memberships
    where trip_id = target_trip_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

create policy "members can read trips"
on trips for select
using (is_trip_member(id));

create policy "owners can update trips"
on trips for update
using (is_trip_admin(id))
with check (is_trip_admin(id));

create policy "members can read memberships"
on trip_memberships for select
using (is_trip_member(trip_id));

create policy "admins can manage memberships"
on trip_memberships for all
using (is_trip_admin(trip_id))
with check (is_trip_admin(trip_id));

create policy "members can read players"
on players for select
using (is_trip_member(trip_id));

create policy "admins can manage players"
on players for all
using (is_trip_admin(trip_id))
with check (is_trip_admin(trip_id));

create policy "members can read courses"
on courses for select
using (is_trip_member(trip_id));

create policy "admins can manage courses"
on courses for all
using (is_trip_admin(trip_id))
with check (is_trip_admin(trip_id));

create policy "members can read course holes"
on course_holes for select
using (
  exists (
    select 1 from courses
    where courses.id = course_holes.course_id
      and is_trip_member(courses.trip_id)
  )
);

create policy "admins can manage course holes"
on course_holes for all
using (
  exists (
    select 1 from courses
    where courses.id = course_holes.course_id
      and is_trip_admin(courses.trip_id)
  )
)
with check (
  exists (
    select 1 from courses
    where courses.id = course_holes.course_id
      and is_trip_admin(courses.trip_id)
  )
);

create policy "members can read rounds"
on rounds for select
using (is_trip_member(trip_id));

create policy "admins can manage rounds"
on rounds for all
using (is_trip_admin(trip_id))
with check (is_trip_admin(trip_id));

create policy "members can read round entries"
on round_entries for select
using (
  exists (
    select 1 from rounds
    where rounds.id = round_entries.round_id
      and is_trip_member(rounds.trip_id)
  )
);

create policy "admins can manage round entries"
on round_entries for all
using (
  exists (
    select 1 from rounds
    where rounds.id = round_entries.round_id
      and is_trip_admin(rounds.trip_id)
  )
)
with check (
  exists (
    select 1 from rounds
    where rounds.id = round_entries.round_id
      and is_trip_admin(rounds.trip_id)
  )
);

create policy "members can read entry players"
on round_entry_players for select
using (
  exists (
    select 1 from round_entries
    join rounds on rounds.id = round_entries.round_id
    where round_entries.id = round_entry_players.round_entry_id
      and is_trip_member(rounds.trip_id)
  )
);

create policy "admins can manage entry players"
on round_entry_players for all
using (
  exists (
    select 1 from round_entries
    join rounds on rounds.id = round_entries.round_id
    where round_entries.id = round_entry_players.round_entry_id
      and is_trip_admin(rounds.trip_id)
  )
)
with check (
  exists (
    select 1 from round_entries
    join rounds on rounds.id = round_entries.round_id
    where round_entries.id = round_entry_players.round_entry_id
      and is_trip_admin(rounds.trip_id)
  )
);

create policy "members can read scores"
on scores for select
using (
  exists (
    select 1 from round_entries
    join rounds on rounds.id = round_entries.round_id
    where round_entries.id = scores.round_entry_id
      and is_trip_member(rounds.trip_id)
  )
);

create policy "admins can manage scores"
on scores for all
using (
  exists (
    select 1 from round_entries
    join rounds on rounds.id = round_entries.round_id
    where round_entries.id = scores.round_entry_id
      and is_trip_admin(rounds.trip_id)
  )
)
with check (
  exists (
    select 1 from round_entries
    join rounds on rounds.id = round_entries.round_id
    where round_entries.id = scores.round_entry_id
      and is_trip_admin(rounds.trip_id)
  )
);

create policy "members can read awards"
on awards for select
using (
  exists (
    select 1 from rounds
    where rounds.id = awards.round_id
      and is_trip_member(rounds.trip_id)
  )
);

create policy "admins can manage awards"
on awards for all
using (
  exists (
    select 1 from rounds
    where rounds.id = awards.round_id
      and is_trip_admin(rounds.trip_id)
  )
)
with check (
  exists (
    select 1 from rounds
    where rounds.id = awards.round_id
      and is_trip_admin(rounds.trip_id)
  )
);

-- Production hardening and app RPCs.
-- The initial section above creates the base schema. This section brings a fresh
-- database to the same shape used by the deployed Supabase app.

create schema if not exists private;

alter function public.is_trip_member(uuid) set schema private;
alter function public.is_trip_admin(uuid) set schema private;

grant usage on schema private to authenticated;
grant execute on function private.is_trip_member(uuid) to authenticated;
grant execute on function private.is_trip_admin(uuid) to authenticated;
revoke all on function private.is_trip_member(uuid) from anon;
revoke all on function private.is_trip_admin(uuid) from anon;
revoke all on function private.is_trip_member(uuid) from public;
revoke all on function private.is_trip_admin(uuid) from public;

create index if not exists idx_trips_created_by on trips(created_by);
create index if not exists idx_trip_memberships_user_id on trip_memberships(user_id);
create index if not exists idx_trip_memberships_player_id on trip_memberships(player_id);
create index if not exists idx_players_trip_id on players(trip_id);
create index if not exists idx_courses_trip_id on courses(trip_id);
create index if not exists idx_course_holes_course_id on course_holes(course_id);
create index if not exists idx_rounds_trip_id on rounds(trip_id);
create index if not exists idx_rounds_course_id on rounds(course_id);
create index if not exists idx_round_entries_round_id on round_entries(round_id);
create index if not exists idx_round_entries_scorer_player_id on round_entries(scorer_player_id);
create index if not exists idx_round_entries_submitted_by on round_entries(submitted_by);
create index if not exists idx_round_entries_approved_by on round_entries(approved_by);
create index if not exists idx_round_entry_players_round_entry_id on round_entry_players(round_entry_id);
create index if not exists idx_round_entry_players_player_id on round_entry_players(player_id);
create index if not exists idx_scores_round_entry_id on scores(round_entry_id);
create index if not exists idx_awards_round_id on awards(round_id);
create index if not exists idx_awards_player_id on awards(player_id);

drop policy if exists "members can read trips" on trips;
drop policy if exists "owners can update trips" on trips;
drop policy if exists "members can read memberships" on trip_memberships;
drop policy if exists "admins can manage memberships" on trip_memberships;
drop policy if exists "members can read players" on players;
drop policy if exists "admins can manage players" on players;
drop policy if exists "members can read courses" on courses;
drop policy if exists "admins can manage courses" on courses;
drop policy if exists "members can read course holes" on course_holes;
drop policy if exists "admins can manage course holes" on course_holes;
drop policy if exists "members can read rounds" on rounds;
drop policy if exists "admins can manage rounds" on rounds;
drop policy if exists "members can read round entries" on round_entries;
drop policy if exists "admins can manage round entries" on round_entries;
drop policy if exists "members can read entry players" on round_entry_players;
drop policy if exists "admins can manage entry players" on round_entry_players;
drop policy if exists "members can read scores" on scores;
drop policy if exists "admins can manage scores" on scores;
drop policy if exists "members can read awards" on awards;
drop policy if exists "admins can manage awards" on awards;

create policy "authorized can read trips" on trips for select to authenticated using (
  private.is_trip_member(id)
  or created_by = (select auth.uid())
);
create policy "users can create trips" on trips for insert to authenticated with check (created_by = (select auth.uid()));
create policy "admins can update trips" on trips for update to authenticated using (private.is_trip_admin(id)) with check (private.is_trip_admin(id));
create policy "admins can delete trips" on trips for delete to authenticated using (private.is_trip_admin(id));

create policy "members can read memberships" on trip_memberships for select to authenticated using (private.is_trip_member(trip_id));
create policy "authorized can insert memberships" on trip_memberships for insert to authenticated with check (
  private.is_trip_admin(trip_id)
  or (
    user_id = (select auth.uid())
    and role = 'owner'
    and exists (select 1 from trips where trips.id = trip_memberships.trip_id and trips.created_by = (select auth.uid()))
  )
);
create policy "admins can update memberships" on trip_memberships for update to authenticated using (private.is_trip_admin(trip_id)) with check (private.is_trip_admin(trip_id));
create policy "admins can delete memberships" on trip_memberships for delete to authenticated using (private.is_trip_admin(trip_id));

create policy "members can read players" on players for select to authenticated using (private.is_trip_member(trip_id));
create policy "admins can insert players" on players for insert to authenticated with check (private.is_trip_admin(trip_id));
create policy "admins can update players" on players for update to authenticated using (private.is_trip_admin(trip_id)) with check (private.is_trip_admin(trip_id));
create policy "admins can delete players" on players for delete to authenticated using (private.is_trip_admin(trip_id));

create policy "members can read courses" on courses for select to authenticated using (private.is_trip_member(trip_id));
create policy "admins can insert courses" on courses for insert to authenticated with check (private.is_trip_admin(trip_id));
create policy "admins can update courses" on courses for update to authenticated using (private.is_trip_admin(trip_id)) with check (private.is_trip_admin(trip_id));
create policy "admins can delete courses" on courses for delete to authenticated using (private.is_trip_admin(trip_id));

create policy "members can read course holes" on course_holes for select to authenticated using (
  exists (select 1 from courses where courses.id = course_holes.course_id and private.is_trip_member(courses.trip_id))
);
create policy "admins can insert course holes" on course_holes for insert to authenticated with check (
  exists (select 1 from courses where courses.id = course_holes.course_id and private.is_trip_admin(courses.trip_id))
);
create policy "admins can update course holes" on course_holes for update to authenticated using (
  exists (select 1 from courses where courses.id = course_holes.course_id and private.is_trip_admin(courses.trip_id))
) with check (
  exists (select 1 from courses where courses.id = course_holes.course_id and private.is_trip_admin(courses.trip_id))
);
create policy "admins can delete course holes" on course_holes for delete to authenticated using (
  exists (select 1 from courses where courses.id = course_holes.course_id and private.is_trip_admin(courses.trip_id))
);

create policy "members can read rounds" on rounds for select to authenticated using (private.is_trip_member(trip_id));
create policy "admins can insert rounds" on rounds for insert to authenticated with check (private.is_trip_admin(trip_id));
create policy "admins can update rounds" on rounds for update to authenticated using (private.is_trip_admin(trip_id)) with check (private.is_trip_admin(trip_id));
create policy "admins can delete rounds" on rounds for delete to authenticated using (private.is_trip_admin(trip_id));

create policy "members can read round entries" on round_entries for select to authenticated using (
  exists (select 1 from rounds where rounds.id = round_entries.round_id and private.is_trip_member(rounds.trip_id))
);
create policy "admins can insert round entries" on round_entries for insert to authenticated with check (
  exists (select 1 from rounds where rounds.id = round_entries.round_id and private.is_trip_admin(rounds.trip_id))
);
create policy "authorized can update round entries" on round_entries for update to authenticated using (
  exists (select 1 from rounds where rounds.id = round_entries.round_id and private.is_trip_admin(rounds.trip_id))
  or exists (
    select 1 from rounds
    join trip_memberships on trip_memberships.trip_id = rounds.trip_id
    where rounds.id = round_entries.round_id
      and trip_memberships.user_id = (select auth.uid())
      and trip_memberships.player_id = round_entries.scorer_player_id
      and rounds.locked = false
  )
) with check (
  exists (select 1 from rounds where rounds.id = round_entries.round_id and private.is_trip_admin(rounds.trip_id))
  or exists (
    select 1 from rounds
    join trip_memberships on trip_memberships.trip_id = rounds.trip_id
    where rounds.id = round_entries.round_id
      and trip_memberships.user_id = (select auth.uid())
      and trip_memberships.player_id = round_entries.scorer_player_id
      and rounds.locked = false
  )
);
create policy "admins can delete round entries" on round_entries for delete to authenticated using (
  exists (select 1 from rounds where rounds.id = round_entries.round_id and private.is_trip_admin(rounds.trip_id))
);

create policy "members can read entry players" on round_entry_players for select to authenticated using (
  exists (
    select 1 from round_entries
    join rounds on rounds.id = round_entries.round_id
    where round_entries.id = round_entry_players.round_entry_id
      and private.is_trip_member(rounds.trip_id)
  )
);
create policy "admins can insert entry players" on round_entry_players for insert to authenticated with check (
  exists (
    select 1 from round_entries
    join rounds on rounds.id = round_entries.round_id
    where round_entries.id = round_entry_players.round_entry_id
      and private.is_trip_admin(rounds.trip_id)
  )
);
create policy "admins can update entry players" on round_entry_players for update to authenticated using (
  exists (
    select 1 from round_entries
    join rounds on rounds.id = round_entries.round_id
    where round_entries.id = round_entry_players.round_entry_id
      and private.is_trip_admin(rounds.trip_id)
  )
) with check (
  exists (
    select 1 from round_entries
    join rounds on rounds.id = round_entries.round_id
    where round_entries.id = round_entry_players.round_entry_id
      and private.is_trip_admin(rounds.trip_id)
  )
);
create policy "admins can delete entry players" on round_entry_players for delete to authenticated using (
  exists (
    select 1 from round_entries
    join rounds on rounds.id = round_entries.round_id
    where round_entries.id = round_entry_players.round_entry_id
      and private.is_trip_admin(rounds.trip_id)
  )
);

create policy "members can read scores" on scores for select to authenticated using (
  exists (
    select 1 from round_entries
    join rounds on rounds.id = round_entries.round_id
    where round_entries.id = scores.round_entry_id
      and private.is_trip_member(rounds.trip_id)
  )
);
create policy "authorized can insert scores" on scores for insert to authenticated with check (
  exists (
    select 1 from round_entries
    join rounds on rounds.id = round_entries.round_id
    where round_entries.id = scores.round_entry_id
      and private.is_trip_admin(rounds.trip_id)
  )
  or exists (
    select 1 from round_entries
    join rounds on rounds.id = round_entries.round_id
    join trip_memberships on trip_memberships.trip_id = rounds.trip_id
    where round_entries.id = scores.round_entry_id
      and trip_memberships.user_id = (select auth.uid())
      and trip_memberships.player_id = round_entries.scorer_player_id
      and rounds.locked = false
      and round_entries.approved_at is null
  )
);
create policy "authorized can update scores" on scores for update to authenticated using (
  exists (
    select 1 from round_entries
    join rounds on rounds.id = round_entries.round_id
    where round_entries.id = scores.round_entry_id
      and private.is_trip_admin(rounds.trip_id)
  )
  or exists (
    select 1 from round_entries
    join rounds on rounds.id = round_entries.round_id
    join trip_memberships on trip_memberships.trip_id = rounds.trip_id
    where round_entries.id = scores.round_entry_id
      and trip_memberships.user_id = (select auth.uid())
      and trip_memberships.player_id = round_entries.scorer_player_id
      and rounds.locked = false
      and round_entries.approved_at is null
  )
) with check (
  exists (
    select 1 from round_entries
    join rounds on rounds.id = round_entries.round_id
    where round_entries.id = scores.round_entry_id
      and private.is_trip_admin(rounds.trip_id)
  )
  or exists (
    select 1 from round_entries
    join rounds on rounds.id = round_entries.round_id
    join trip_memberships on trip_memberships.trip_id = rounds.trip_id
    where round_entries.id = scores.round_entry_id
      and trip_memberships.user_id = (select auth.uid())
      and trip_memberships.player_id = round_entries.scorer_player_id
      and rounds.locked = false
      and round_entries.approved_at is null
  )
);
create policy "authorized can delete scores" on scores for delete to authenticated using (
  exists (
    select 1 from round_entries
    join rounds on rounds.id = round_entries.round_id
    where round_entries.id = scores.round_entry_id
      and private.is_trip_admin(rounds.trip_id)
  )
  or exists (
    select 1 from round_entries
    join rounds on rounds.id = round_entries.round_id
    join trip_memberships on trip_memberships.trip_id = rounds.trip_id
    where round_entries.id = scores.round_entry_id
      and trip_memberships.user_id = (select auth.uid())
      and trip_memberships.player_id = round_entries.scorer_player_id
      and rounds.locked = false
      and round_entries.approved_at is null
  )
);

create policy "members can read awards" on awards for select to authenticated using (
  exists (select 1 from rounds where rounds.id = awards.round_id and private.is_trip_member(rounds.trip_id))
);
create policy "admins can insert awards" on awards for insert to authenticated with check (
  exists (select 1 from rounds where rounds.id = awards.round_id and private.is_trip_admin(rounds.trip_id))
);
create policy "admins can update awards" on awards for update to authenticated using (
  exists (select 1 from rounds where rounds.id = awards.round_id and private.is_trip_admin(rounds.trip_id))
) with check (
  exists (select 1 from rounds where rounds.id = awards.round_id and private.is_trip_admin(rounds.trip_id))
);
create policy "admins can delete awards" on awards for delete to authenticated using (
  exists (select 1 from rounds where rounds.id = awards.round_id and private.is_trip_admin(rounds.trip_id))
);

create or replace function private.join_trip_by_invite(invite_code_input text)
returns table (trip_id uuid, membership_id uuid)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  found_trip_id uuid;
  found_membership_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select id into found_trip_id
  from trips
  where upper(invite_code) = upper(trim(invite_code_input))
  limit 1;

  if found_trip_id is null then
    raise exception 'Invite code not found';
  end if;

  insert into trip_memberships (trip_id, user_id, role)
  values (found_trip_id, auth.uid(), 'player')
  on conflict (trip_id, user_id) do update set user_id = excluded.user_id
  returning id into found_membership_id;

  return query select found_trip_id, found_membership_id;
end;
$$;

create or replace function private.claim_player_profile(player_id_input uuid)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  target_trip_id uuid;
  found_membership_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select trip_id into target_trip_id
  from players
  where id = player_id_input and active = true;

  if target_trip_id is null then
    raise exception 'Player not found';
  end if;

  select id into found_membership_id
  from trip_memberships
  where trip_id = target_trip_id and user_id = auth.uid();

  if found_membership_id is null then
    raise exception 'Join the trip before claiming a player';
  end if;

  if exists (
    select 1 from trip_memberships
    where trip_id = target_trip_id
      and player_id = player_id_input
      and user_id <> auth.uid()
  ) then
    raise exception 'Player profile already claimed';
  end if;

  update trip_memberships
  set player_id = player_id_input
  where id = found_membership_id;

  return found_membership_id;
end;
$$;

create or replace function public.join_trip_by_invite(invite_code_input text)
returns table (trip_id uuid, membership_id uuid)
language sql
security invoker
set search_path = public, private
as $$
  select * from private.join_trip_by_invite(invite_code_input);
$$;

create or replace function public.claim_player_profile(player_id_input uuid)
returns uuid
language sql
security invoker
set search_path = public, private
as $$
  select private.claim_player_profile(player_id_input);
$$;

revoke all on function private.join_trip_by_invite(text) from public;
revoke all on function private.claim_player_profile(uuid) from public;
revoke all on function public.join_trip_by_invite(text) from public;
revoke all on function public.claim_player_profile(uuid) from public;
grant execute on function private.join_trip_by_invite(text) to authenticated;
grant execute on function private.claim_player_profile(uuid) to authenticated;
grant execute on function public.join_trip_by_invite(text) to authenticated;
grant execute on function public.claim_player_profile(uuid) to authenticated;
