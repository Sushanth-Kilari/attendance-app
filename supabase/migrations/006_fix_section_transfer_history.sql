-- ============================================================
-- Migration 006: Fix attendance history loss on section transfer
-- ============================================================
-- v_student_subject_attendance (003_views.sql) enumerated subjects by
-- joining the student's CURRENT section to teaching_assignments, then
-- left-joined attendance through THAT assignment's sessions. When a
-- student transfers sections mid-semester, their attendance recorded
-- under the OLD section's assignment became invisible: the view now
-- looks at the NEW section's assignment for the same subject (a
-- different assignment_id, with its own separate session history),
-- so the student's real, unchanged attendance_records rows simply
-- never match any row the view produces. Confirmed by testing the
-- exact "student transfers sections" scenario CLAUDE.md calls out —
-- the transferred student's subject attendance reset to 0/0/null even
-- though nothing in attendance_records had changed.
--
-- Fix: derive (student, subject, session) combinations from two
-- sources, unioned: (1) the student's current section's active
-- assignments (so a subject with no sessions yet still shows a 0/0
-- row), and (2) any session the student actually has an
-- attendance_record for, regardless of which assignment/section that
-- session belongs to (so history from a section they've left is never
-- lost). v_student_overall_attendance, v_defaulters, v_section_summary,
-- and the ai_readonly.* views all select from this view and need no
-- changes themselves — CREATE OR REPLACE keeps the exact same output
-- column names/types, so they pick up the fix automatically.
-- ============================================================

create or replace view v_student_subject_attendance as
with subject_sessions as (
  select st.user_id as student_id, ta.subject_id, cs.id as session_id, cs.status as session_status
  from students st
  join teaching_assignments ta on ta.section_id = st.section_id and ta.is_active
  left join class_sessions cs on cs.assignment_id = ta.id
  union
  select ar.student_id, ta.subject_id, cs.id as session_id, cs.status as session_status
  from attendance_records ar
  join class_sessions cs on cs.id = ar.session_id
  join teaching_assignments ta on ta.id = cs.assignment_id
)
select
  st.user_id                                   as student_id,
  st.roll_no,
  p.full_name                                  as student_name,
  sec.id                                        as section_id,
  d.code                                        as department_code,
  sec.year,
  sec.name                                      as section_name,
  sub.id                                        as subject_id,
  sub.code                                      as subject_code,
  sub.name                                      as subject_name,
  count(ss.session_id) filter (where ss.session_status = 'held')                          as total_sessions,
  count(ar.id) filter (where ar.status in ('present','late','on_duty')
                        and ss.session_status = 'held')                                    as attended_sessions,
  round(
    100.0 * count(ar.id) filter (where ar.status in ('present','late','on_duty')
                                  and ss.session_status = 'held')
    / nullif(count(ss.session_id) filter (where ss.session_status = 'held'), 0)
  , 2)                                                                                     as attendance_pct
from subject_sessions ss
join students st        on st.user_id = ss.student_id
join profiles p         on p.id = st.user_id
join sections sec       on sec.id = st.section_id
join departments d      on d.id = sec.department_id
join subjects sub       on sub.id = ss.subject_id
left join attendance_records ar on ar.session_id = ss.session_id and ar.student_id = ss.student_id
group by st.user_id, st.roll_no, p.full_name, sec.id, d.code,
         sec.year, sec.name, sub.id, sub.code, sub.name;
