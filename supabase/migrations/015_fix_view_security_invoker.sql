-- 003_views.sql set security_invoker = true on all 4 reporting views so
-- RLS on the underlying tables (students, attendance_records, etc.) would
-- still apply when a real user queries the view. 006_fix_section_transfer_history.sql
-- then did `create or replace view v_student_subject_attendance as ...` to
-- fix the section-transfer bug, but a CREATE OR REPLACE VIEW does not
-- carry forward reloptions set by a prior ALTER VIEW ... SET (...) — it
-- silently reset security_invoker back to its default (false/definer).
--
-- Effect while broken: since these views are owned by a privileged role,
-- querying as an unprivileged authenticated user (e.g. a student) ran the
-- view's query as the OWNER, bypassing RLS on students/attendance_records
-- entirely. A signed-in student could see every other student's per-subject
-- attendance summary via v_student_subject_attendance — a real data leak,
-- caught by tests/rls/pilot-checklist.test.ts's section-transfer test
-- unexpectedly returning other students' rows.
--
-- Re-assert on all 4 views defensively (only v_student_subject_attendance
-- was actually recreated since 003, but this is idempotent and cheap).
alter view v_student_subject_attendance set (security_invoker = true);
alter view v_student_overall_attendance set (security_invoker = true);
alter view v_defaulters                 set (security_invoker = true);
alter view v_section_summary            set (security_invoker = true);
