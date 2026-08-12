-- ============================================================
-- Migration 012: Faculty substitutions
-- Admin arranges a different faculty to cover a specific class on a
-- specific date. The substitute needs the same RLS-granted rights as the
-- assigned faculty for that one session — done by extending the existing
-- single-source-of-truth checks (is_faculty_of_session) rather than
-- special-casing every call site.
-- ============================================================

create table class_substitutions (
  id                     uuid primary key default gen_random_uuid(),
  assignment_id          uuid not null references teaching_assignments (id) on delete cascade,
  session_date           date not null,
  substitute_faculty_id  uuid not null references profiles (id),
  reason                 text,
  created_by             uuid not null references profiles (id),
  created_at             timestamptz not null default now(),
  unique (assignment_id, session_date)
);

alter table class_substitutions enable row level security;

create policy "authenticated read substitutions"
  on class_substitutions for select to authenticated using (true);

create policy "admin manage substitutions"
  on class_substitutions for all to authenticated
  using (current_role_of_user() = 'admin')
  with check (current_role_of_user() = 'admin');

-- Extends the existing check — no other semantics changed, still no
-- is_active requirement here, matching the original function exactly.
create or replace function is_faculty_of_session(p_session_id uuid)
returns boolean
language sql stable security definer
as $$
  select exists (
    select 1
    from class_sessions cs
    join teaching_assignments ta on ta.id = cs.assignment_id
    where cs.id = p_session_id
      and (
        ta.faculty_id = auth.uid()
        or exists (
          select 1 from class_substitutions sub
          where sub.assignment_id = cs.assignment_id
            and sub.session_date = cs.session_date
            and sub.substitute_faculty_id = auth.uid()
        )
      )
  );
$$;

-- Same "assigned faculty OR today's substitute" check, usable before a
-- class_sessions row exists (insert-time), since it takes assignment+date
-- directly instead of a session id.
create or replace function is_covering_assignment(p_assignment_id uuid, p_date date)
returns boolean
language sql stable security definer
as $$
  select exists (
    select 1 from teaching_assignments ta where ta.id = p_assignment_id and ta.faculty_id = auth.uid()
  ) or exists (
    select 1 from class_substitutions sub
    where sub.assignment_id = p_assignment_id
      and sub.session_date = p_date
      and sub.substitute_faculty_id = auth.uid()
  );
$$;

-- Re-created with the substitute-aware check. is_active stays required
-- only for insert (matches original "faculty create own sessions"
-- semantics exactly) — select/update never had that requirement.
drop policy "faculty create own sessions" on class_sessions;
create policy "faculty create own sessions"
  on class_sessions for insert to authenticated
  with check (
    is_covering_assignment(assignment_id, session_date)
    and exists (select 1 from teaching_assignments ta where ta.id = assignment_id and ta.is_active)
  );

drop policy "faculty read own sessions" on class_sessions;
create policy "faculty read own sessions"
  on class_sessions for select to authenticated
  using (
    is_covering_assignment(assignment_id, session_date)
    or current_role_of_user() in ('hod', 'admin')
  );

drop policy "faculty update own sessions" on class_sessions;  -- from migration 011
create policy "faculty update own sessions"
  on class_sessions for update to authenticated
  using (is_covering_assignment(assignment_id, session_date))
  with check (is_covering_assignment(assignment_id, session_date));
