-- ============================================================
-- Migration 014: Fix migration 013's unqualified "id" reference
-- The subquery `where sub.assignment_id = id` was ambiguous — Postgres
-- resolved the bare "id" to class_substitutions' own id column (via the
-- "sub" alias's table), not the outer teaching_assignments.id, since
-- class_substitutions also has an "id" column. That made the condition
-- always false (comparing a substitution row's own PK to an unrelated
-- assignment_id), so the policy silently granted nobody anything.
-- Confirmed live: a direct query as the substitute returned zero
-- teaching_assignments rows even for the exact assignment they were
-- covering.
-- ============================================================

drop policy "substitute reads covered assignments" on teaching_assignments;

create policy "substitute reads covered assignments"
  on teaching_assignments for select to authenticated
  using (
    exists (
      select 1 from class_substitutions sub
      where sub.assignment_id = teaching_assignments.id
        and sub.substitute_faculty_id = auth.uid()
    )
  );
