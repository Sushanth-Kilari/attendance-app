-- ============================================================
-- Migration 005: AI-safe query functions
-- ============================================================
-- CLAUDE.md's original plan called for the Next.js AI route to connect
-- with a session that does `SET ROLE ai_reader`, which assumes a raw
-- Postgres connection. The Next.js app only ever talks to Supabase
-- through the REST API (anon/service-role keys), so there's no session
-- to SET ROLE on. These functions achieve the same safety property a
-- different way: each is SECURITY DEFINER (so it can read ai_readonly.*
-- regardless of the caller's own grants) but re-checks the caller's role
-- itself before returning anything — so even a client that calls the
-- RPC directly (bypassing the Next.js route's own check) gets nothing
-- unless they're faculty/hod/admin. Students never see AI data, at the
-- database level, not just the API level.
--
-- Living in the public schema (not ai_readonly) means no PostgREST
-- "exposed schemas" dashboard setting is required — public is exposed
-- by default.
-- ============================================================

create or replace function public.ai_get_student_subject_attendance(
  p_department_code text default null,
  p_section_name text default null,
  p_year smallint default null
)
returns table (
  roll_no text,
  student_name text,
  department_code text,
  year smallint,
  section_name text,
  subject_code text,
  subject_name text,
  total_sessions bigint,
  attended_sessions bigint,
  attendance_pct numeric
)
language sql
security definer
set search_path = public, ai_readonly
as $$
  select roll_no, student_name, department_code, year, section_name,
         subject_code, subject_name, total_sessions, attended_sessions, attendance_pct
  from ai_readonly.student_subject_attendance
  where current_role_of_user() in ('faculty', 'hod', 'admin')
    and (p_department_code is null or department_code = p_department_code)
    and (p_section_name is null or section_name = p_section_name)
    and (p_year is null or year = p_year)
  limit 200;
$$;

create or replace function public.ai_get_section_summary(
  p_department_code text default null
)
returns table (
  department_code text,
  year smallint,
  section_name text,
  subject_code text,
  subject_name text,
  students bigint,
  avg_attendance_pct numeric,
  defaulter_count bigint
)
language sql
security definer
set search_path = public, ai_readonly
as $$
  select department_code, year, section_name, subject_code, subject_name,
         students, avg_attendance_pct, defaulter_count
  from ai_readonly.section_summary
  where current_role_of_user() in ('faculty', 'hod', 'admin')
    and (p_department_code is null or department_code = p_department_code)
  limit 200;
$$;

create or replace function public.ai_get_defaulters(
  p_department_code text default null
)
returns table (
  roll_no text,
  student_name text,
  department_code text,
  year smallint,
  section_name text,
  subject_code text,
  subject_name text,
  attendance_pct numeric
)
language sql
security definer
set search_path = public, ai_readonly
as $$
  select roll_no, student_name, department_code, year, section_name,
         subject_code, subject_name, attendance_pct
  from ai_readonly.defaulters
  where current_role_of_user() in ('faculty', 'hod', 'admin')
    and (p_department_code is null or department_code = p_department_code)
  limit 200;
$$;

grant execute on function public.ai_get_student_subject_attendance to authenticated;
grant execute on function public.ai_get_section_summary to authenticated;
grant execute on function public.ai_get_defaulters to authenticated;
