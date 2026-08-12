-- ============================================================
-- Migration 013: Substitute can read the assignment they're covering
-- "faculty read own assignments" only allows the assigned faculty (or
-- hod/admin) to read a teaching_assignments row — a substitute isn't the
-- assigned faculty, so the nested teaching_assignments(...) embed in
-- class_substitutions queries silently returned null (RLS blocks it, no
-- error), leaving subject/section blank on the "Covering for others"
-- section of /faculty. Additive policy — RLS SELECT policies OR together,
-- so this doesn't touch the existing one.
-- ============================================================

create policy "substitute reads covered assignments"
  on teaching_assignments for select to authenticated
  using (
    exists (
      select 1 from class_substitutions sub
      where sub.assignment_id = id and sub.substitute_faculty_id = auth.uid()
    )
  );
