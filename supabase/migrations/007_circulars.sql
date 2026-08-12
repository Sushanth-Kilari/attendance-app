-- ============================================================
-- Migration 007: Holiday circulars — HOD-approved, emailed to students
-- Two sources feed the same pending_approval queue:
--   1. Auto-drafted by the cron job (src/app/api/cron/generate-circulars)
--      from important_dates, one row per department, created_by = null.
--   2. Manually written by an HOD for their own department, created_by = them.
-- Either way, nothing emails until an HOD approves it.
-- ============================================================

create type circular_status as enum ('pending_approval', 'approved', 'rejected', 'sent');

-- ---------- Admin-maintained holiday calendar ----------
create table important_dates (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,                 -- 'Independence Day'
  occasion_month  smallint not null check (occasion_month between 1 and 12),
  occasion_day    smallint not null check (occasion_day between 1 and 31),
  lead_days       smallint not null default 3,    -- draft this many days ahead
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

insert into important_dates (title, occasion_month, occasion_day, lead_days) values
  ('Independence Day', 8, 15, 3),
  ('Republic Day', 1, 26, 3),
  ('Gandhi Jayanti', 10, 2, 3);

-- ---------- Circulars ----------
create table circulars (
  id                uuid primary key default gen_random_uuid(),
  important_date_id uuid references important_dates (id),   -- null = manually created
  department_id     uuid not null references departments (id),
  occasion_year     smallint not null,
  title             text not null,
  body              text not null,
  status            circular_status not null default 'pending_approval',
  created_by        uuid references profiles (id),          -- null = auto-drafted by cron
  created_at        timestamptz not null default now(),
  reviewed_by       uuid references profiles (id),
  reviewed_at       timestamptz,
  rejection_reason  text,
  sent_at           timestamptz,
  recipient_count   smallint,
  failed_count      smallint,
  -- Prevents the cron job from double-drafting the same holiday for the
  -- same department in the same year (NULL important_date_id rows, i.e.
  -- manual circulars, aren't constrained by this — NULLs are always
  -- distinct in a unique index).
  unique (important_date_id, department_id, occasion_year)
);

create index idx_circulars_department_status on circulars (department_id, status);

-- ---------- RLS ----------
alter table important_dates enable row level security;
alter table circulars enable row level security;

create policy "admin manage important dates"
  on important_dates for all to authenticated
  using (current_role_of_user() = 'admin')
  with check (current_role_of_user() = 'admin');

create policy "hod reads own department circulars"
  on circulars for select to authenticated
  using (current_role_of_user() = 'hod' and department_id = current_department_of_user());

create policy "admin reads all circulars"
  on circulars for select to authenticated
  using (current_role_of_user() = 'admin');

-- Manual creation: an HOD may only author drafts for their own department.
-- Auto-drafts from the cron job are written via the service-role client,
-- which bypasses RLS entirely (documented in the cron route itself).
create policy "hod creates own department circulars"
  on circulars for insert to authenticated
  with check (current_role_of_user() = 'hod' and department_id = current_department_of_user());

-- HOD may edit/approve/reject only their own department's drafts, and only
-- while still pending — once approved/rejected/sent, the row is locked.
create policy "hod updates own pending circulars"
  on circulars for update to authenticated
  using (
    current_role_of_user() = 'hod'
    and department_id = current_department_of_user()
    and status = 'pending_approval'
  )
  with check (
    current_role_of_user() = 'hod'
    and department_id = current_department_of_user()
  );

-- No delete policy: rejected/sent circulars stay as a record, same spirit
-- as "no deletes on attendance_records" in CLAUDE.md.
