-- ============================================================
-- Migration 023: video observations + discrepancy engine
-- ============================================================
-- PRIVACY: observations are AGGREGATE COUNTS only — a head-count and
-- per-item equipment tallies per sampled frame window. No frames, crops,
-- embeddings or identities are ever sent to or stored in this database.
--
-- SECURITY: the edge worker is a machine, not a user, and CLAUDE.md rule 1
-- forbids the service-role key in request paths. So ingest is a
-- SECURITY DEFINER function callable by `anon` that authenticates the
-- centre by a per-centre ingest key (only its SHA-256 hash is stored) and
-- can do exactly one thing: append an observation for THAT centre and
-- re-evaluate discrepancies. No table is writable by anon.
--
-- ENGINE: discrepancies are derived in SQL, next to the data, so claimed
-- vs observed numbers are computed by the database, never re-derived in
-- the UI or the AI layer (CLAUDE.md rule 4 spirit).
-- ============================================================

-- ---------- Period clock times (global college timetable) ----------
-- class_sessions only have a period_no; to link a camera observation to a
-- session we need to know what clock time each period runs.
create extension if not exists pgcrypto with schema extensions;

create table period_times (
  period_no  smallint primary key check (period_no between 1 and 10),
  starts_at  time not null,
  ends_at    time not null,
  check (ends_at > starts_at)
);

insert into period_times (period_no, starts_at, ends_at) values
  (1, '09:00', '10:00'), (2, '10:00', '11:00'), (3, '11:00', '12:00'), (4, '12:00', '13:00'),
  (5, '14:00', '15:00'), (6, '15:00', '16:00'), (7, '16:00', '17:00'), (8, '17:00', '18:00');

-- ---------- Cameras: which batch a camera watches ----------
create table centre_cameras (
  id         uuid primary key default gen_random_uuid(),
  centre_id  uuid not null references centres (id) on delete cascade,
  label      text not null,                         -- 'Lab-1 front', matches worker config
  section_id uuid references sections (id) on delete set null,  -- batch normally in this room
  created_at timestamptz not null default now(),
  unique (centre_id, label)
);

-- ---------- Per-centre ingest keys (hash only) ----------
create table centre_ingest_keys (
  centre_id  uuid primary key references centres (id) on delete cascade,
  key_hash   text not null,
  rotated_at timestamptz not null default now()
);

-- ---------- Observations (counts only) ----------
create table video_observations (
  id              uuid primary key default gen_random_uuid(),
  centre_id       uuid not null references centres (id) on delete cascade,
  camera_id       uuid references centre_cameras (id) on delete set null,
  session_id      uuid references class_sessions (id) on delete set null,
  observed_at     timestamptz not null,
  person_count    integer not null check (person_count between 0 and 1000),
  -- {"Welding bench": 5} or {"CNC lathe": {"count": 2, "operating": 1}}.
  -- A key that is ABSENT means "this worker did not check that item" and is
  -- never treated as "missing".
  equipment       jsonb not null default '{}'::jsonb,
  frames_sampled  integer not null default 1 check (frames_sampled >= 1),
  mean_confidence numeric(4,3) check (mean_confidence between 0 and 1),
  model_version   text,
  created_at      timestamptz not null default now(),
  -- Makes offline-queue replays idempotent.
  unique nulls not distinct (centre_id, camera_id, observed_at)
);

create index idx_obs_centre_time on video_observations (centre_id, observed_at desc);
create index idx_obs_session on video_observations (session_id);

-- ---------- Discrepancies ----------
create type discrepancy_kind as enum (
  'attendance_mismatch',     -- centre claims more present than cameras saw
  'capacity_exceeded',       -- more people seen than sanctioned seats
  'equipment_missing',       -- fewer units seen than sanctioned
  'equipment_nonfunctional'  -- units seen but fewer operating than present
);
create type discrepancy_severity as enum ('low', 'medium', 'high');
create type discrepancy_status as enum ('open', 'acknowledged', 'resolved', 'dismissed');

create table discrepancies (
  id             uuid primary key default gen_random_uuid(),
  -- One logical finding per key, so repeated observations update it
  -- instead of flooding the dashboard: 'att:<session>', 'cap:<centre>:<date>',
  -- 'eq:<centre>:<date>:<item>', 'op:<centre>:<date>:<item>'.
  dedupe_key     text not null unique,
  centre_id      uuid not null references centres (id) on delete cascade,
  session_id     uuid references class_sessions (id) on delete set null,
  kind           discrepancy_kind not null,
  severity       discrepancy_severity not null,
  item_name      text,
  claimed_count  integer,      -- centre-reported (attendance) or sanctioned (inventory)
  observed_count integer,      -- peak seen on camera
  detail         text not null,
  observed_date  date not null,
  status         discrepancy_status not null default 'open',
  follow_up_note text,
  reviewed_by    uuid references profiles (id),
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index idx_disc_centre_status on discrepancies (centre_id, status);
create index idx_disc_date on discrepancies (observed_date desc);

-- ---------- RLS ----------
alter table period_times         enable row level security;
alter table centre_cameras       enable row level security;
alter table centre_ingest_keys   enable row level security;
alter table video_observations   enable row level security;
alter table discrepancies        enable row level security;

create policy "authenticated read period_times"
  on period_times for select to authenticated using (true);
create policy "admin manage period_times"
  on period_times for all to authenticated
  using (current_role_of_user() = 'admin') with check (current_role_of_user() = 'admin');

create policy "staff read centre_cameras"
  on centre_cameras for select to authenticated
  using (current_role_of_user() in ('faculty', 'hod', 'admin', 'monitor'));
create policy "admin manage centre_cameras"
  on centre_cameras for all to authenticated
  using (current_role_of_user() = 'admin') with check (current_role_of_user() = 'admin');

-- centre_ingest_keys: NO policies at all => unreadable and unwritable for
-- every API role. Only the SECURITY DEFINER functions below touch it.

create policy "oversight read video_observations"
  on video_observations for select to authenticated
  using (current_role_of_user() in ('admin', 'monitor'));
-- No insert/update/delete policy: observations are written only by
-- ingest_video_observation().

create policy "oversight read discrepancies"
  on discrepancies for select to authenticated
  using (current_role_of_user() in ('admin', 'monitor'));

-- Monitors/admin record follow-up; the guard trigger below restricts WHICH
-- columns may change, since RLS cannot express column-level rules.
create policy "monitor update discrepancy follow-up"
  on discrepancies for update to authenticated
  using (current_role_of_user() in ('admin', 'monitor'))
  with check (current_role_of_user() in ('admin', 'monitor'));

create or replace function guard_discrepancy_update()
returns trigger
language plpgsql
as $$
begin
  -- Engine writes (SECURITY DEFINER ingest, running as the table owner)
  -- pass through; interactive users may only touch the follow-up fields.
  if current_user in ('authenticated', 'anon') then
    if (new.dedupe_key, new.centre_id, new.session_id, new.kind, new.severity, new.item_name,
        new.claimed_count, new.observed_count, new.detail, new.observed_date, new.created_at)
       is distinct from
       (old.dedupe_key, old.centre_id, old.session_id, old.kind, old.severity, old.item_name,
        old.claimed_count, old.observed_count, old.detail, old.observed_date, old.created_at) then
      raise exception 'Only status and follow-up note can be changed on a discrepancy';
    end if;
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_guard_discrepancy_update
before update on discrepancies
for each row execute function guard_discrepancy_update();

-- NOTE: monitors get NO direct read on attendance_records / class_sessions /
-- teaching_assignments. They only need counts, not which trainee was
-- marked, so the dashboard reads an aggregate view added in M4. Least
-- privilege: the monitoring unit never sees individual trainee rows.

-- ---------- Ingest key management (admin only) ----------
-- Returns the plaintext key ONCE; only its hash is stored.
create or replace function rotate_centre_ingest_key(p_centre_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
begin
  if current_role_of_user() is distinct from 'admin' then
    raise exception 'Only an admin can rotate ingest keys';
  end if;

  v_key := encode(gen_random_bytes(24), 'hex');

  insert into centre_ingest_keys (centre_id, key_hash, rotated_at)
  values (p_centre_id, encode(digest(v_key, 'sha256'), 'hex'), now())
  on conflict (centre_id) do update set key_hash = excluded.key_hash, rotated_at = now();

  return v_key;
end;
$$;

revoke all on function rotate_centre_ingest_key(uuid) from public, anon;
grant execute on function rotate_centre_ingest_key(uuid) to authenticated;

-- ---------- Engine: evaluate one session (attendance) ----------
-- Compares what the centre CLAIMED (present + late rows) with the PEAK
-- head-count any camera saw during that session. Peak, not average: a
-- detector under-counts through occlusion, never over-counts a full room,
-- so the maximum is the fairest estimate of who was physically there.
--
-- Thresholds (documented so the assessment in M5 can tune them):
--   instructor allowance = 1   (the trainer is in frame but not a trainee)
--   tolerance            = max(2, 15% of claimed)   (occlusion / edge-of-frame)
--   severity by shortfall share of claimed: >=40% high, >=25% medium, else low
create or replace function evaluate_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c_instructor constant int := 1;
  v_centre uuid;
  v_date date;
  v_claimed int;
  v_peak int;
  v_trainees int;
  v_shortfall int;
  v_tolerance int;
  v_sev discrepancy_severity;
  v_key text := 'att:' || p_session_id;
begin
  select sec.centre_id, cs.session_date
    into v_centre, v_date
  from class_sessions cs
  join teaching_assignments ta on ta.id = cs.assignment_id
  join sections sec on sec.id = ta.section_id
  where cs.id = p_session_id;

  if v_centre is null then return; end if;

  select count(*) into v_claimed
  from attendance_records ar
  where ar.session_id = p_session_id and ar.status in ('present', 'late');

  select max(person_count) into v_peak
  from video_observations where session_id = p_session_id;

  -- No camera data yet: nothing to compare. (claimed = 0 falls through so a
  -- correction down to zero clears a stale open finding.)
  if v_peak is null then return; end if;

  v_trainees := greatest(v_peak - c_instructor, 0);
  v_shortfall := v_claimed - v_trainees;
  v_tolerance := greatest(2, ceil(0.15 * v_claimed)::int);

  if v_shortfall > v_tolerance then
    v_sev := case
      when v_shortfall >= 0.40 * v_claimed then 'high'
      when v_shortfall >= 0.25 * v_claimed then 'medium'
      else 'low' end;

    insert into discrepancies
      (dedupe_key, centre_id, session_id, kind, severity, claimed_count, observed_count, detail, observed_date)
    values
      (v_key, v_centre, p_session_id, 'attendance_mismatch', v_sev, v_claimed, v_trainees,
       format('Centre marked %s present; cameras saw at most %s trainees (peak head-count %s incl. instructor).',
              v_claimed, v_trainees, v_peak),
       v_date)
    on conflict (dedupe_key) do update
      set severity = excluded.severity,
          claimed_count = excluded.claimed_count,
          observed_count = excluded.observed_count,
          detail = excluded.detail,
          -- A previously cleared finding that recurs is re-opened.
          status = case when discrepancies.status = 'resolved' and discrepancies.reviewed_by is null
                        then 'open' else discrepancies.status end;
  else
    update discrepancies
       set status = 'resolved', follow_up_note = 'Cleared automatically by a later observation.'
     where dedupe_key = v_key and status = 'open';
  end if;
end;
$$;

-- ---------- Engine: evaluate a centre-day (capacity + equipment) ----------
create or replace function evaluate_centre_day(p_centre_id uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seats int;
  v_peak int;
  r record;
  v_obs numeric;
  v_op numeric;
  v_sev discrepancy_severity;
  v_has boolean;
begin
  -- Capacity: more people than sanctioned seats (+ instructor).
  select coalesce(sum(sanctioned_qty), 0) into v_seats
  from centre_inventory where centre_id = p_centre_id and category = 'seating';

  select max(person_count) into v_peak
  from video_observations
  where centre_id = p_centre_id and (observed_at at time zone 'Asia/Kolkata')::date = p_date;

  if v_seats > 0 and v_peak is not null then
    if v_peak > v_seats + 1 then
      insert into discrepancies
        (dedupe_key, centre_id, kind, severity, item_name, claimed_count, observed_count, detail, observed_date)
      values
        ('cap:' || p_centre_id || ':' || p_date, p_centre_id, 'capacity_exceeded',
         case when v_peak >= 1.5 * v_seats then 'high' else 'medium' end::discrepancy_severity,
         'Seating', v_seats, v_peak,
         format('Cameras saw up to %s people; sanctioned seating is %s.', v_peak, v_seats), p_date)
      on conflict (dedupe_key) do update
        set observed_count = excluded.observed_count, detail = excluded.detail;
    else
      update discrepancies set status = 'resolved', follow_up_note = 'Cleared automatically by a later observation.'
       where dedupe_key = 'cap:' || p_centre_id || ':' || p_date and status = 'open';
    end if;
  end if;

  -- Equipment: for each sanctioned (non-seating) item the worker REPORTED
  -- on at least one observation that day, compare the PEAK count seen with
  -- the sanctioned quantity. Unreported items are not evaluated.
  for r in
    select item_name, sanctioned_qty
    from centre_inventory
    where centre_id = p_centre_id and category <> 'seating' and sanctioned_qty > 0
  loop
    select
      bool_or(o.equipment ? r.item_name),
      max(case jsonb_typeof(o.equipment -> r.item_name)
            when 'number' then (o.equipment ->> r.item_name)::numeric
            when 'object' then (o.equipment -> r.item_name ->> 'count')::numeric
          end),
      max(case when jsonb_typeof(o.equipment -> r.item_name) = 'object'
               then (o.equipment -> r.item_name ->> 'operating')::numeric end)
    into v_has, v_obs, v_op
    from video_observations o
    where o.centre_id = p_centre_id
      and (o.observed_at at time zone 'Asia/Kolkata')::date = p_date;

    if not coalesce(v_has, false) or v_obs is null then continue; end if;

    if v_obs < r.sanctioned_qty then
      v_sev := case
        when v_obs = 0 then 'high'
        when v_obs <= 0.5 * r.sanctioned_qty then 'medium'
        else 'low' end;
      insert into discrepancies
        (dedupe_key, centre_id, kind, severity, item_name, claimed_count, observed_count, detail, observed_date)
      values
        ('eq:' || p_centre_id || ':' || p_date || ':' || r.item_name, p_centre_id, 'equipment_missing', v_sev,
         r.item_name, r.sanctioned_qty, v_obs::int,
         format('%s: sanctioned %s, cameras saw at most %s.', r.item_name, r.sanctioned_qty, v_obs::int), p_date)
      on conflict (dedupe_key) do update
        set severity = excluded.severity, observed_count = excluded.observed_count, detail = excluded.detail;
    else
      update discrepancies set status = 'resolved', follow_up_note = 'Cleared automatically by a later observation.'
       where dedupe_key = 'eq:' || p_centre_id || ':' || p_date || ':' || r.item_name and status = 'open';
    end if;

    -- Operability: only when the worker reported an operating count.
    if v_op is not null then
      if v_op < least(v_obs, r.sanctioned_qty) then
        insert into discrepancies
          (dedupe_key, centre_id, kind, severity, item_name, claimed_count, observed_count, detail, observed_date)
        values
          ('op:' || p_centre_id || ':' || p_date || ':' || r.item_name, p_centre_id, 'equipment_nonfunctional',
           case when v_op = 0 then 'high' else 'medium' end::discrepancy_severity,
           r.item_name, least(v_obs, r.sanctioned_qty)::int, v_op::int,
           format('%s: %s present but only %s appeared to be operating.', r.item_name, v_obs::int, v_op::int), p_date)
        on conflict (dedupe_key) do update
          set severity = excluded.severity, observed_count = excluded.observed_count, detail = excluded.detail;
      else
        update discrepancies set status = 'resolved', follow_up_note = 'Cleared automatically by a later observation.'
         where dedupe_key = 'op:' || p_centre_id || ':' || p_date || ':' || r.item_name and status = 'open';
      end if;
    end if;
  end loop;
end;
$$;

revoke all on function evaluate_session(uuid), evaluate_centre_day(uuid, date) from public, anon, authenticated;

-- ---------- Ingest (the only door for the edge worker) ----------
create or replace function ingest_video_observation(
  p_centre_code     text,
  p_ingest_key      text,
  p_camera_label    text,
  p_observed_at     timestamptz,
  p_person_count    integer,
  p_equipment       jsonb default '{}'::jsonb,
  p_frames_sampled  integer default 1,
  p_mean_confidence numeric default null,
  p_model_version   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_centre uuid;
  v_hash text;
  v_camera uuid;
  v_section uuid;
  v_local timestamp;
  v_period smallint;
  v_session uuid;
  v_obs uuid;
begin
  select c.id, k.key_hash into v_centre, v_hash
  from centres c join centre_ingest_keys k on k.centre_id = c.id
  where c.code = upper(p_centre_code) and c.is_active;

  -- Same error for unknown centre and wrong key: don't reveal which exists.
  if v_centre is null or v_hash is distinct from encode(digest(p_ingest_key, 'sha256'), 'hex') then
    raise exception 'invalid centre or ingest key' using errcode = '28000';
  end if;

  if p_observed_at > now() + interval '5 minutes' then
    raise exception 'observed_at is in the future' using errcode = '22023';
  end if;

  select id, section_id into v_camera, v_section
  from centre_cameras where centre_id = v_centre and label = p_camera_label;

  -- Resolve the class session this observation falls in (camera's batch,
  -- local date, period containing the local time). Null if none was held/
  -- marked — equipment and capacity checks still run at centre level.
  if v_section is not null then
    v_local := p_observed_at at time zone 'Asia/Kolkata';
    select period_no into v_period
    from period_times
    where v_local::time >= starts_at and v_local::time < ends_at;

    if v_period is not null then
      select cs.id into v_session
      from class_sessions cs
      join teaching_assignments ta on ta.id = cs.assignment_id
      where ta.section_id = v_section
        and cs.session_date = v_local::date
        and cs.period_no = v_period
        and cs.status = 'held'
      limit 1;
    end if;
  end if;

  insert into video_observations
    (centre_id, camera_id, session_id, observed_at, person_count, equipment,
     frames_sampled, mean_confidence, model_version)
  values
    (v_centre, v_camera, v_session, p_observed_at, p_person_count, coalesce(p_equipment, '{}'::jsonb),
     greatest(coalesce(p_frames_sampled, 1), 1), p_mean_confidence, p_model_version)
  on conflict (centre_id, camera_id, observed_at) do nothing
  returning id into v_obs;

  -- Replay of an already-stored observation: nothing new to evaluate.
  if v_obs is null then
    return jsonb_build_object('status', 'duplicate');
  end if;

  if v_session is not null then perform evaluate_session(v_session); end if;
  perform evaluate_centre_day(v_centre, (p_observed_at at time zone 'Asia/Kolkata')::date);

  return jsonb_build_object('status', 'stored', 'observation_id', v_obs, 'session_id', v_session);
end;
$$;

revoke all on function ingest_video_observation(text, text, text, timestamptz, integer, jsonb, integer, numeric, text) from public;
grant execute on function ingest_video_observation(text, text, text, timestamptz, integer, jsonb, integer, numeric, text) to anon, authenticated;

-- Attendance can be marked (or corrected) AFTER the cameras saw the room —
-- "marking a day late" is an explicit CLAUDE.md test scenario — so
-- re-evaluate the session whenever its attendance changes.
create or replace function reevaluate_on_attendance_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform evaluate_session(coalesce(new.session_id, old.session_id));
  return null;
end;
$$;

create trigger trg_reevaluate_on_attendance
after insert or update of status on attendance_records
for each row execute function reevaluate_on_attendance_change();
