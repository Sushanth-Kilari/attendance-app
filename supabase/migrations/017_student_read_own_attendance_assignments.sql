-- Same gap as 016, one join deeper: "student read own section assignments"
-- (004_student_assignment_access.sql) only lets a student read
-- teaching_assignments rows for their CURRENT section. The
-- v_student_subject_attendance historical branch also joins
-- teaching_assignments (to resolve subject_id from the session), so a
-- transferred student's old-section assignment was still invisible even
-- after 016 fixed class_sessions — same symptom, one table over.
--
-- Additive: a student can read a teaching_assignments row if they have an
-- attendance_records row against a class_sessions row that belongs to it.
create policy "student read own attendance assignments"
  on teaching_assignments for select to authenticated
  using (
    exists (
      select 1
      from class_sessions cs
      join attendance_records ar on ar.session_id = cs.id
      where cs.assignment_id = teaching_assignments.id and ar.student_id = auth.uid()
    )
  );
