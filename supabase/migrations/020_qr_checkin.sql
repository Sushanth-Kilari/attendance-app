-- ============================================================
-- Migration 020: QR-based self-check-in
-- ============================================================
-- Additive to the existing faculty tap-and-submit flow (CLAUDE.md rule 5
-- stays intact — this never replaces it, faculty still reviews the full
-- roster and submits). Faculty displays a rotating QR code for the
-- currently-open session; a student scans it on their own phone and
-- self-marks present, gated by three checks: (1) a short-lived token
-- matching the one currently shown (so a screenshot only works for a
-- brief window), (2) the request originating from an admin-approved
-- campus IP range (so it can't be used from off-campus), (3) RLS still
-- requires the row to be the student's own, for a session in their own
-- section — the actual security boundary. Token/IP checks happen in the
-- server action (RLS can't see request headers or a session's live token
-- state); RLS is what prevents a bug in that action from ever letting a
-- student mark someone else present.
-- ============================================================

create table network_ranges (
  id         uuid primary key default gen_random_uuid(),
  label      text not null,
  cidr       text not null,
  created_at timestamptz not null default now()
);

alter table network_ranges enable row level security;

-- Readable by any authenticated user: the self-check-in server action
-- runs as the signed-in student (never service-role, per CLAUDE.md rule
-- 1), so it needs its own read access to check IPs against. Not sensitive
-- data — same "reference data, admin writes" pattern as departments.
create policy "authenticated read network ranges"
  on network_ranges for select to authenticated using (true);

create policy "admin manage network ranges"
  on network_ranges for all to authenticated
  using (current_role_of_user() = 'admin')
  with check (current_role_of_user() = 'admin');

alter table class_sessions add column checkin_token text;
alter table class_sessions add column checkin_token_expires_at timestamptz;
-- No new policy needed: "faculty update own sessions" (012_substitutions.sql)
-- already lets the covering faculty update any column on their own
-- session, including these two.

-- Additive: a student can insert their OWN attendance record for a
-- session belonging to their current section. This is the actual
-- authorization boundary for self-check-in — everything else (token,
-- expiry, network) is checked in the server action before this insert
-- ever runs, but even if that check had a bug, this policy alone still
-- prevents a student from ever creating a row for anyone but themselves,
-- or for a class they're not in.
create policy "student self check in own section"
  on attendance_records for insert to authenticated
  with check (
    student_id = auth.uid()
    and exists (
      select 1
      from class_sessions cs
      join teaching_assignments ta on ta.id = cs.assignment_id
      join students s on s.section_id = ta.section_id
      where cs.id = session_id and s.user_id = auth.uid()
    )
  );
