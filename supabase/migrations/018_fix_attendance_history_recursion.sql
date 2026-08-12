-- 016 and 017 each added a raw EXISTS-subquery RLS policy that reaches
-- into the OTHER table (class_sessions' policy checks attendance_records;
-- teaching_assignments' policy checks class_sessions+attendance_records,
-- which in turn re-evaluates class_sessions' own RLS, including 016's
-- policy) — together they form a cycle Postgres detects as infinite
-- recursion (42P17). The fix, matching the existing is_faculty_of_session()
-- / is_covering_assignment() pattern (002_rls.sql, 012_substitutions.sql):
-- move each check into a `security definer` function. Such a function
-- runs as its (table-owning) definer, so its internal queries don't
-- re-trigger RLS on the tables it reads — breaking the cycle.
drop policy "student read own attendance sessions" on class_sessions;
drop policy "student read own attendance assignments" on teaching_assignments;

create or replace function has_own_attendance_for_session(p_session_id uuid)
returns boolean
language sql stable security definer
as $$
  select exists (
    select 1 from attendance_records ar
    where ar.session_id = p_session_id and ar.student_id = auth.uid()
  );
$$;

create or replace function has_own_attendance_for_assignment(p_assignment_id uuid)
returns boolean
language sql stable security definer
as $$
  select exists (
    select 1
    from class_sessions cs
    join attendance_records ar on ar.session_id = cs.id
    where cs.assignment_id = p_assignment_id and ar.student_id = auth.uid()
  );
$$;

create policy "student read own attendance sessions"
  on class_sessions for select to authenticated
  using (has_own_attendance_for_session(id));

create policy "student read own attendance assignments"
  on teaching_assignments for select to authenticated
  using (has_own_attendance_for_assignment(id));
