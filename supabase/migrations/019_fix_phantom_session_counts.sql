-- 006_fix_section_transfer_history.sql's subject_sessions CTE has two
-- branches: (1) the student's CURRENT section's active assignments,
-- left-joined to class_sessions, so a subject with zero sessions so far
-- still produces a visible 0/0 row; (2) every session the student
-- actually has an attendance_records row for, regardless of section, so
-- history from a section they've left is never lost.
--
-- Branch (1) over-delivers: the left join pulls in EVERY held session of
-- the current-section assignment, including ones held before the student
-- was ever part of that section (e.g. right after a transfer) or ones
-- where the student was, for whatever reason, never marked at all. Since
-- branch (2) already supplies every session this student has real
-- attendance history for, branch (1)'s session rows are pure double-
-- counting risk — confirmed by tests/rls/pilot-checklist.test.ts's section-
-- transfer test: total_sessions inflated by the new section's own session
-- count immediately upon transfer, before the student had attended
-- anything there.
--
-- Fix: branch (1) only needs to guarantee the (student, subject) pair
-- exists in the output (so an unattended subject still shows 0/0) — it
-- must not contribute any real session_id/session_status. All real counts
-- come from branch (2) alone.
create or replace view v_student_subject_attendance as
with subject_sessions as (
  select st.user_id as student_id, ta.subject_id, null::uuid as session_id, null::session_status as session_status
  from students st
  join teaching_assignments ta on ta.section_id = st.section_id and ta.is_active
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

alter view v_student_subject_attendance set (security_invoker = true);
