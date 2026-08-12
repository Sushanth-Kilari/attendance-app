-- ============================================================
-- Migration 004: Student read access to teaching assignments
-- ============================================================
-- Pre-existing gap: teaching_assignments had no SELECT policy for
-- students, only "faculty read own assignments" (faculty_id =
-- auth.uid() or hod/admin). Two things that were already written
-- to depend on students reading this table were silently broken:
--
-- 1. class_sessions "student read section sessions" (002_rls.sql)
--    does an EXISTS subquery against teaching_assignments — with
--    no visibility there, it always evaluated to false.
-- 2. v_student_subject_attendance and everything built on it
--    (v_student_overall_attendance, v_defaulters) join through
--    teaching_assignments with security_invoker = true, so a
--    student querying them got zero rows.
--
-- This policy is additive: it only adds a new allowed case
-- (own-section rows) on top of the existing faculty/admin policy,
-- via Postgres's OR-together semantics for multiple permissive
-- policies. Nothing existing is weakened.
-- ============================================================

create policy "student read own section assignments"
  on teaching_assignments for select to authenticated
  using (
    exists (
      select 1 from students s
      where s.section_id = teaching_assignments.section_id
        and s.user_id = auth.uid()
    )
  );
