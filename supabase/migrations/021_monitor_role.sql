-- ============================================================
-- Migration 021: 'monitor' role (scheme monitoring unit)
-- ============================================================
-- Kept in its own file on purpose: Postgres refuses to USE a newly added
-- enum value inside the same transaction that added it, and 022 creates
-- policies that reference 'monitor'. Run this file first, on its own.
--
-- A monitor is a read-only reviewer across all training centres: sees
-- centres, inventory, attendance, video observations and discrepancies,
-- and updates the follow-up status on a discrepancy. They never mark or
-- edit attendance.
-- ============================================================

alter type app_role add value if not exists 'monitor';
