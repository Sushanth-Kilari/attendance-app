-- ============================================================
-- Migration 009: Realtime for HOD/admin report dashboards
-- /reports and /reports/defaulters query views (v_section_summary,
-- v_defaulters), and Postgres logical replication only fires on base
-- table writes, not views — so we subscribe to attendance_records (the
-- table that actually moves every number those views compute) and
-- refetch the view client-side. See src/hooks/use-realtime-refetch.ts.
-- ============================================================

alter publication supabase_realtime add table attendance_records;
