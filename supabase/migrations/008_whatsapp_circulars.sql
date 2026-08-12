-- ============================================================
-- Migration 008: Phone numbers for students + WhatsApp delivery
-- tracking on circulars. WhatsApp is additive to email — see
-- src/lib/whatsapp/msg91.ts and src/app/reports/circulars/actions.ts.
-- ============================================================

-- Nullable and optional throughout: existing/re-imported students without
-- a phone number simply don't get the WhatsApp leg of a circular send.
alter table students add column phone_number text;

alter table students add constraint students_phone_number_format
  check (phone_number is null or phone_number ~ '^\+[1-9]\d{7,14}$');

alter table circulars add column whatsapp_sent_count smallint;
alter table circulars add column whatsapp_failed_count smallint;
