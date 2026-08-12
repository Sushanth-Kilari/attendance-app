-- "student read section sessions" (002_rls.sql) only lets a student read
-- class_sessions rows belonging to their CURRENT section. Once a student
-- transfers sections, that policy can no longer see any class_sessions row
-- from their OLD section — even sessions they have real attendance_records
-- against. Since v_student_subject_attendance's historical branch inner-
-- joins class_sessions, this silently zeroed out all pre-transfer
-- attendance for the transferred student (CLAUDE.md's explicit "old
-- attendance stays tied to old sessions" pilot scenario). This was masked
-- until 015_fix_view_security_invoker.sql restored real RLS enforcement on
-- the view; before that fix the view ran as the (privileged) view owner
-- and bypassed this restriction entirely.
--
-- Additive: a student can read a class_sessions row if they have an
-- attendance_records row for it, regardless of their current section.
create policy "student read own attendance sessions"
  on class_sessions for select to authenticated
  using (
    exists (
      select 1 from attendance_records ar
      where ar.session_id = class_sessions.id and ar.student_id = auth.uid()
    )
  );
