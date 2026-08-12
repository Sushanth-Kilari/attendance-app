-- ============================================================
-- Migration 011: Topic covered per class session
-- Faculty can note what they taught when they submit attendance;
-- students see it in their session history.
-- ============================================================

alter table class_sessions add column topic text;

-- class_sessions had no UPDATE policy at all before this — insert/select
-- existed, but nothing let faculty write to a session they already
-- created (e.g. to record the topic after class). Scoped the same way
-- "faculty read own sessions" already is.
create policy "faculty update own sessions"
  on class_sessions for update to authenticated
  using (
    exists (
      select 1 from teaching_assignments ta
      where ta.id = assignment_id and ta.faculty_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from teaching_assignments ta
      where ta.id = assignment_id and ta.faculty_id = auth.uid()
    )
  );
