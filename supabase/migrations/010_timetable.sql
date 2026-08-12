-- ============================================================
-- Migration 010: Weekly timetable for faculty sessions
-- Lets admin schedule which teaching_assignment happens on which
-- day-of-week + period, so faculty's page can pre-fill "today's
-- schedule" instead of a blind period picker, and HOD/admin can spot
-- classes that were scheduled but never started (see
-- src/app/reports/missed-classes).
-- ============================================================

create table timetable_slots (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references teaching_assignments (id) on delete cascade,
  -- Denormalized from the assignment at insert time, purely so the two
  -- unique constraints below can exist without a trigger.
  faculty_id    uuid not null references profiles (id),
  section_id    uuid not null references sections (id),
  day_of_week   smallint not null check (day_of_week between 1 and 6), -- 1=Mon..6=Sat, no Sunday
  period_no     smallint not null check (period_no between 1 and 10),
  created_at    timestamptz not null default now(),
  unique (section_id, day_of_week, period_no),  -- a section can't double-book a period
  unique (faculty_id, day_of_week, period_no)   -- a faculty can't double-book a period
);

alter table timetable_slots enable row level security;

-- Same tier as sections/subjects: harmless reference data, readable by
-- any logged-in user (faculty need to read their own slots; students
-- could reasonably see their own section's schedule too).
create policy "authenticated read timetable_slots"
  on timetable_slots for select to authenticated using (true);

create policy "admin manage timetable_slots"
  on timetable_slots for all to authenticated
  using (current_role_of_user() = 'admin')
  with check (current_role_of_user() = 'admin');
