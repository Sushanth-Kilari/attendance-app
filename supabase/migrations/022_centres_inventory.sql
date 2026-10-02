-- ============================================================
-- Migration 022: training centres + sanctioned inventory
-- ============================================================
-- Adapts the attendance system to scheme monitoring (video-analytics
-- problem statement). Additive only — the department/section/session
-- model is unchanged:
--   departments = scheme / trade vertical   (unchanged)
--   sections    = a trainee batch, now placed at ONE centre (centre_id)
--   subjects    = course / module           (unchanged)
-- A class session reaches its centre via assignment -> section -> centre,
-- so "attendance claimed by the centre" needs no new attendance table.
--
-- centre_inventory is the SANCTIONED baseline the video worker's
-- observations are compared against (seating, workbenches, machinery).
-- ============================================================

create table centres (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,                 -- e.g. 'TC-HYD-014'
  name       text not null,
  state      text not null,
  district   text not null,
  area_type  text not null default 'rural'
             check (area_type in ('rural', 'semi_urban', 'urban')),
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create type inventory_category as enum ('seating', 'workbench', 'machinery', 'computer', 'other');

create table centre_inventory (
  id             uuid primary key default gen_random_uuid(),
  centre_id      uuid not null references centres (id) on delete cascade,
  category       inventory_category not null,
  item_name      text not null,                    -- 'CNC lathe', 'Welding bench'
  sanctioned_qty integer not null check (sanctioned_qty >= 0),
  created_at     timestamptz not null default now(),
  unique (centre_id, item_name)
);

alter table sections add column centre_id uuid references centres (id) on delete set null;

create index idx_sections_centre on sections (centre_id);
create index idx_inventory_centre on centre_inventory (centre_id);

-- ---------- RLS ----------
alter table centres          enable row level security;
alter table centre_inventory enable row level security;

-- Centres are reference data (same pattern as departments): any signed-in
-- user may read them, only admin writes.
create policy "authenticated read centres"
  on centres for select to authenticated using (true);

create policy "admin manage centres"
  on centres for all to authenticated
  using (current_role_of_user() = 'admin')
  with check (current_role_of_user() = 'admin');

-- Sanctioned inventory is an oversight artefact: staff and monitors read
-- it, students do not. Only admin edits it.
create policy "staff read centre inventory"
  on centre_inventory for select to authenticated
  using (current_role_of_user() in ('faculty', 'hod', 'admin', 'monitor'));

create policy "admin manage centre inventory"
  on centre_inventory for all to authenticated
  using (current_role_of_user() = 'admin')
  with check (current_role_of_user() = 'admin');

-- A monitor needs to see which batches exist at which centre and who is
-- on the roster count, but sections/subjects are already readable by all
-- authenticated users (002_rls.sql). Attendance/session read access for
-- monitors is added in the migration that introduces the discrepancy
-- engine, where the exact scope is decided.
