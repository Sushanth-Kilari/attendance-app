-- ============================================================
-- Migration 003: Reporting views + AI read-only layer
-- Views power dashboards, exports, and the AI query feature.
-- The AI layer only ever touches these views — never raw tables.
-- ============================================================

-- ---------- Per-student per-subject summary ----------
-- The number every student checks and every report needs.
create or replace view v_student_subject_attendance as
select
  st.user_id                                   as student_id,
  st.roll_no,
  p.full_name                                  as student_name,
  sec.id                                       as section_id,
  d.code                                       as department_code,
  sec.year,
  sec.name                                     as section_name,
  sub.id                                       as subject_id,
  sub.code                                     as subject_code,
  sub.name                                     as subject_name,
  count(ar.id) filter (where cs.status = 'held')                        as total_sessions,
  count(ar.id) filter (where ar.status in ('present','late','on_duty')
                        and cs.status = 'held')                          as attended_sessions,
  round(
    100.0 * count(ar.id) filter (where ar.status in ('present','late','on_duty')
                                  and cs.status = 'held')
    / nullif(count(ar.id) filter (where cs.status = 'held'), 0)
  , 2)                                                                   as attendance_pct
from students st
join profiles p        on p.id = st.user_id
join sections sec      on sec.id = st.section_id
join departments d     on d.id = sec.department_id
join teaching_assignments ta on ta.section_id = sec.id
join subjects sub      on sub.id = ta.subject_id
left join class_sessions cs  on cs.assignment_id = ta.id
left join attendance_records ar on ar.session_id = cs.id
                               and ar.student_id = st.user_id
group by st.user_id, st.roll_no, p.full_name, sec.id, d.code,
         sec.year, sec.name, sub.id, sub.code, sub.name;

-- ---------- Overall per-student summary ----------
create or replace view v_student_overall_attendance as
select
  student_id,
  roll_no,
  student_name,
  section_id,
  department_code,
  year,
  section_name,
  sum(total_sessions)    as total_sessions,
  sum(attended_sessions) as attended_sessions,
  round(100.0 * sum(attended_sessions) / nullif(sum(total_sessions), 0), 2)
                         as attendance_pct
from v_student_subject_attendance
group by student_id, roll_no, student_name, section_id,
         department_code, year, section_name;

-- ---------- Defaulter list (below 75%) ----------
create or replace view v_defaulters as
select *
from v_student_subject_attendance
where attendance_pct is not null
  and attendance_pct < 75
order by department_code, year, section_name, attendance_pct;

-- ---------- Section-level rollup for HOD dashboards ----------
create or replace view v_section_summary as
select
  department_code,
  year,
  section_name,
  subject_code,
  subject_name,
  count(distinct student_id)                       as students,
  round(avg(attendance_pct), 2)                    as avg_attendance_pct,
  count(*) filter (where attendance_pct < 75)      as defaulter_count
from v_student_subject_attendance
group by department_code, year, section_name, subject_code, subject_name;

-- Views run with the caller's permissions by default in Postgres 15+
-- when defined with security_invoker — enforce that so RLS still applies:
alter view v_student_subject_attendance set (security_invoker = true);
alter view v_student_overall_attendance set (security_invoker = true);
alter view v_defaulters                 set (security_invoker = true);
alter view v_section_summary            set (security_invoker = true);

-- ============================================================
-- AI read-only layer
-- The Gemini feature connects as a dedicated role that can
-- SELECT from these views and physically nothing else.
-- ============================================================

create schema if not exists ai_readonly;

-- Mirror the reporting views into the AI schema (no personal emails,
-- no auth data — just what's needed to answer attendance questions).
create or replace view ai_readonly.student_subject_attendance as
  select roll_no, student_name, department_code, year, section_name,
         subject_code, subject_name, total_sessions, attended_sessions,
         attendance_pct
  from public.v_student_subject_attendance;

create or replace view ai_readonly.section_summary as
  select * from public.v_section_summary;

create or replace view ai_readonly.defaulters as
  select roll_no, student_name, department_code, year, section_name,
         subject_code, subject_name, attendance_pct
  from public.v_defaulters;

-- Dedicated role for the AI backend connection:
do $$
begin
  if not exists (select from pg_roles where rolname = 'ai_reader') then
    create role ai_reader nologin;
  end if;
end $$;

grant usage on schema ai_readonly to ai_reader;
grant select on all tables in schema ai_readonly to ai_reader;
revoke all on schema public from ai_reader;

-- NOTE: your Next.js API route should query ai_readonly.* views using a
-- connection that SET ROLE ai_reader, after verifying the logged-in user
-- is faculty/hod/admin. Students never trigger AI calls.
