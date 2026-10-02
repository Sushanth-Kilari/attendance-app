# University Attendance System — Project Guide

This file is read automatically by Claude Code at the start of every session.
It keeps every session consistent with the overall plan.

## What this project is
A university-wide attendance tracking app replacing manual registers.
Target scale: ~10,000 students, ~2,000 faculty, multiple departments.
Benchmark to beat: CampX (attendance module only — we are NOT building an ERP).

## Stack (do not deviate without discussion)
- Next.js 14+ (App Router) + TypeScript
- Supabase: Postgres, Auth, row-level security
- Tailwind CSS + shadcn/ui components
- Deployed on Vercel
- AI layer: Google Gemini free tier (faculty/HOD only, read-only views)

## Non-negotiable design rules
1. RLS is the security boundary. Never bypass it with the service-role key
   in user-facing routes. The service-role key is for admin import jobs only.
2. Attendance is per class_session, never per day.
3. No deletes on attendance_records — corrections are updates, captured by
   the attendance_audit trigger.
4. AI queries touch only ai_readonly.* views. AI never writes anything.
   AI narrates numbers computed by SQL; it never computes percentages itself.
5. Faculty marking flow must complete in under 30 seconds:
   default everyone present -> tap absentees -> submit.

## Database
Migrations live in supabase/migrations/ (001 schema, 002 RLS, 003 views).
Read them before writing any query. Key tables:
departments -> sections -> students(profiles) ; subjects ;
teaching_assignments (faculty x section x subject) -> class_sessions
-> attendance_records (+ attendance_audit).

## Build phases — one phase per Claude Code session, in order
1. Project init: create-next-app, Supabase client setup, env vars, run migrations
2. Auth: login page, role detection from profiles, route protection middleware
3. Admin: departments/sections/subjects CRUD + CSV bulk import for students
4. Faculty flow: today's classes list -> roster -> mark -> submit (the core)
5. Student view: my subjects, percentages, session history
6. HOD/admin dashboard: section summaries, defaulter list, Excel/PDF export
7. AI layer: /api/ai-query route -> Gemini -> SQL against ai_readonly views
8. Polish: mobile layout pass, empty states, error handling, loading states

## Scheme-monitoring extension (video analytics) — phases M1–M5
Adapts this system to the "AI video analytics for skilling-centre attendance
and infrastructure compliance" problem statement. Additive: the attendance
model above is unchanged. Mapping: departments = scheme/trade, sections =
trainee batch at ONE centre (sections.centre_id), subjects = course module.
New role `monitor` (scheme monitoring unit): read-only across centres, may
update follow-up status on discrepancies; never marks attendance.
Privacy rule: the video worker sends COUNTS and equipment tallies only —
never frames, crops or identities. No face recognition anywhere.
- M1 (done): centres + sanctioned inventory (migrations 021, 022), monitor role, admin Centres/Inventory pages, /monitor landing
- M2 (code written; migration 023 NOT yet applied/verified): video_observations + discrepancies, POST /api/video-ingest, SQL discrepancy engine, admin Cameras page + per-centre ingest keys.
  Ingest is a SECURITY DEFINER rpc (ingest_video_observation) authenticated by a hashed per-centre key, so no service-role key is used. Engine compares PEAK head-count (minus 1 instructor, tolerance max(2,15%)) to claimed present+late, and PEAK equipment per day to sanctioned inventory. Monitors get no row access to attendance_records — an aggregate view lands in M4.
- M3: Python worker in worker/ (person detector, frame sampling, offline queue, low-bandwidth mode)
- M4: /monitor dashboard — centres ranked by discrepancy, per-session drill-down, follow-up status
- M5: privacy design note + false-positive/false-negative evaluation on labelled sample footage
Apply order: 021 (enum value, run alone) -> 022 -> 023.

## Session discipline (protects Pro usage limits)
- One phase per session. Do not ask for full-app rewrites.
- Read this file and the relevant migration before generating code.
- After each phase: run it, test with seeded data, commit before moving on.

## Testing scenarios that must pass before pilot
- Faculty teaching two sections of the same subject
- Student transferring sections mid-semester (update students.section_id;
  old attendance stays tied to old sessions — verify percentages stay sane)
- Marking attendance a day late
- Correcting a submitted record (audit row must appear)
- A student trying to query another student's attendance (must fail via RLS)
