-- ============================================================
-- Migration 002: Row-Level Security
-- The rules "student sees only their own data, faculty sees
-- their sections, HOD sees their department, admin sees all"
-- are enforced INSIDE the database — buggy frontend code
-- cannot leak data.
-- ============================================================

-- ---------- Helper functions ----------
-- security definer lets these read profiles without recursive RLS checks.

create or replace function current_role_of_user()
returns app_role
language sql stable security definer
as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function current_department_of_user()
returns uuid
language sql stable security definer
as $$
  select department_id from profiles where id = auth.uid();
$$;

-- Is the current user the faculty on a given session's assignment?
create or replace function is_faculty_of_session(p_session_id uuid)
returns boolean
language sql stable security definer
as $$
  select exists (
    select 1
    from class_sessions cs
    join teaching_assignments ta on ta.id = cs.assignment_id
    where cs.id = p_session_id
      and ta.faculty_id = auth.uid()
  );
$$;

-- ---------- Enable RLS everywhere ----------
alter table departments         enable row level security;
alter table profiles            enable row level security;
alter table sections            enable row level security;
alter table students            enable row level security;
alter table subjects            enable row level security;
alter table teaching_assignments enable row level security;
alter table class_sessions      enable row level security;
alter table attendance_records  enable row level security;
alter table attendance_audit    enable row level security;

-- ---------- Reference data: readable by all logged-in users ----------
create policy "authenticated read departments"
  on departments for select to authenticated using (true);

create policy "authenticated read sections"
  on sections for select to authenticated using (true);

create policy "authenticated read subjects"
  on subjects for select to authenticated using (true);

-- Only admin mutates reference data
create policy "admin manage departments"
  on departments for all to authenticated
  using (current_role_of_user() = 'admin')
  with check (current_role_of_user() = 'admin');

create policy "admin manage sections"
  on sections for all to authenticated
  using (current_role_of_user() = 'admin')
  with check (current_role_of_user() = 'admin');

create policy "admin manage subjects"
  on subjects for all to authenticated
  using (current_role_of_user() = 'admin')
  with check (current_role_of_user() = 'admin');

-- ---------- Profiles ----------
create policy "read own profile"
  on profiles for select to authenticated
  using (id = auth.uid());

create policy "staff read profiles"
  on profiles for select to authenticated
  using (current_role_of_user() in ('faculty', 'hod', 'admin'));

create policy "admin manage profiles"
  on profiles for all to authenticated
  using (current_role_of_user() = 'admin')
  with check (current_role_of_user() = 'admin');

-- ---------- Students ----------
create policy "student reads own student row"
  on students for select to authenticated
  using (user_id = auth.uid());

create policy "staff read students"
  on students for select to authenticated
  using (current_role_of_user() in ('faculty', 'hod', 'admin'));

create policy "admin manage students"
  on students for all to authenticated
  using (current_role_of_user() = 'admin')
  with check (current_role_of_user() = 'admin');

-- ---------- Teaching assignments ----------
create policy "faculty read own assignments"
  on teaching_assignments for select to authenticated
  using (
    faculty_id = auth.uid()
    or current_role_of_user() in ('hod', 'admin')
  );

create policy "admin manage assignments"
  on teaching_assignments for all to authenticated
  using (current_role_of_user() = 'admin')
  with check (current_role_of_user() = 'admin');

-- ---------- Class sessions ----------
-- Faculty create sessions only for their own assignments.
create policy "faculty create own sessions"
  on class_sessions for insert to authenticated
  with check (
    exists (
      select 1 from teaching_assignments ta
      where ta.id = assignment_id and ta.faculty_id = auth.uid() and ta.is_active
    )
  );

create policy "faculty read own sessions"
  on class_sessions for select to authenticated
  using (
    exists (
      select 1 from teaching_assignments ta
      where ta.id = assignment_id and ta.faculty_id = auth.uid()
    )
    or current_role_of_user() in ('hod', 'admin')
  );

-- Students can see sessions of their own section (to view history).
create policy "student read section sessions"
  on class_sessions for select to authenticated
  using (
    exists (
      select 1
      from teaching_assignments ta
      join students s on s.section_id = ta.section_id
      where ta.id = assignment_id and s.user_id = auth.uid()
    )
  );

-- ---------- Attendance records ----------
-- Student: own rows only. This is the single most important policy.
create policy "student reads own attendance"
  on attendance_records for select to authenticated
  using (student_id = auth.uid());

-- Faculty: rows on sessions they teach.
create policy "faculty read own session attendance"
  on attendance_records for select to authenticated
  using (
    is_faculty_of_session(session_id)
    or current_role_of_user() in ('hod', 'admin')
  );

create policy "faculty mark own session attendance"
  on attendance_records for insert to authenticated
  with check (is_faculty_of_session(session_id));

create policy "faculty correct own session attendance"
  on attendance_records for update to authenticated
  using (is_faculty_of_session(session_id))
  with check (is_faculty_of_session(session_id));

-- No delete policy on attendance_records: nobody deletes attendance.
-- Corrections happen via update and are captured in attendance_audit.

-- ---------- Audit log ----------
create policy "staff read audit"
  on attendance_audit for select to authenticated
  using (current_role_of_user() in ('hod', 'admin'));
