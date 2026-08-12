-- ============================================================
-- University Attendance System — Core Schema
-- Migration 001: tables, enums, constraints, indexes
-- Run in Supabase SQL Editor or via `supabase db push`
-- ============================================================

-- ---------- Enums ----------
create type app_role as enum ('student', 'faculty', 'hod', 'admin');
create type attendance_status as enum ('present', 'absent', 'late', 'on_duty');
create type session_status as enum ('scheduled', 'held', 'cancelled');

-- ---------- Departments ----------
create table departments (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,          -- e.g. 'CSE'
  name        text not null,                 -- e.g. 'Computer Science and Engineering'
  created_at  timestamptz not null default now()
);

-- ---------- Profiles (extends Supabase auth.users) ----------
-- Every logged-in user (student, faculty, hod, admin) has one profile row.
create table profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  full_name     text not null,
  email         text not null unique,
  role          app_role not null default 'student',
  department_id uuid references departments (id),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ---------- Sections ----------
-- A section is a class group: CSE, 3rd year, Section B, academic year 2026-27
create table sections (
  id            uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments (id),
  year          smallint not null check (year between 1 and 6),
  name          text not null,               -- 'A', 'B', 'C'
  academic_year text not null,               -- '2026-27'
  unique (department_id, year, name, academic_year)
);

-- ---------- Students ----------
-- 1:1 extension of profiles for users whose role = 'student'
create table students (
  user_id    uuid primary key references profiles (id) on delete cascade,
  roll_no    text not null unique,           -- university roll number
  section_id uuid not null references sections (id),
  batch      text not null,                  -- admission batch, e.g. '2023-27'
  created_at timestamptz not null default now()
);

-- ---------- Subjects ----------
create table subjects (
  id            uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments (id),
  code          text not null,               -- 'CS301'
  name          text not null,               -- 'Database Management Systems'
  semester      smallint not null check (semester between 1 and 12),
  unique (department_id, code)
);

-- ---------- Teaching assignments ----------
-- The pivot that makes everything flexible: WHO teaches WHAT to WHOM.
-- Substitutes, shared subjects, multi-section faculty are all just rows here.
create table teaching_assignments (
  id         uuid primary key default gen_random_uuid(),
  faculty_id uuid not null references profiles (id),
  section_id uuid not null references sections (id),
  subject_id uuid not null references subjects (id),
  semester   text not null,                  -- 'ODD-2026' / 'EVEN-2027'
  is_active  boolean not null default true,
  unique (faculty_id, section_id, subject_id, semester)
);

-- ---------- Class sessions ----------
-- One row per actual class period. Attendance hangs off sessions, not days,
-- so "attended period 1, bunked period 4" is representable.
create table class_sessions (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references teaching_assignments (id),
  session_date  date not null,
  period_no     smallint not null check (period_no between 1 and 10),
  status        session_status not null default 'held',
  created_by    uuid not null references profiles (id),
  created_at    timestamptz not null default now(),
  unique (assignment_id, session_date, period_no)
);

-- ---------- Attendance records ----------
-- One row per student per session. marked_by/marked_at = audit trail.
create table attendance_records (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references class_sessions (id) on delete cascade,
  student_id uuid not null references students (user_id),
  status     attendance_status not null,
  marked_by  uuid not null references profiles (id),
  marked_at  timestamptz not null default now(),
  updated_at timestamptz,
  unique (session_id, student_id)
);

-- ---------- Audit log for corrections ----------
-- When faculty edits a submitted record, the old value is preserved here.
-- This is what lets you win a "ma'am I was present" dispute.
create table attendance_audit (
  id          uuid primary key default gen_random_uuid(),
  record_id   uuid not null references attendance_records (id) on delete cascade,
  old_status  attendance_status not null,
  new_status  attendance_status not null,
  changed_by  uuid not null references profiles (id),
  changed_at  timestamptz not null default now(),
  reason      text
);

-- ---------- Indexes for the hot paths ----------
-- Faculty loading a roster / submitting a class:
create index idx_sessions_assignment_date on class_sessions (assignment_id, session_date);
-- Student checking their own percentage (most frequent read):
create index idx_attendance_student on attendance_records (student_id);
-- Report generation per session:
create index idx_attendance_session on attendance_records (session_id);
-- Section rosters:
create index idx_students_section on students (section_id);
-- HOD dashboards filter by department through sections:
create index idx_sections_department on sections (department_id);

-- ---------- Trigger: audit every attendance correction ----------
create or replace function log_attendance_change()
returns trigger
language plpgsql
security definer
as $$
begin
  if old.status is distinct from new.status then
    insert into attendance_audit (record_id, old_status, new_status, changed_by)
    values (old.id, old.status, new.status, auth.uid());
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger trg_attendance_audit
before update on attendance_records
for each row execute function log_attendance_change();
