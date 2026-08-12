# University Attendance System — Getting Started

Everything here is designed to run on free tiers: Supabase (database + auth),
Vercel (hosting), Gemini (AI features).

## Step 1 — Create the Supabase project (5 minutes)
1. Go to https://supabase.com -> New project (free tier).
2. Pick a region close to you (Mumbai `ap-south-1` for Hyderabad).
3. Save the database password somewhere safe.

## Step 2 — Run the migrations, in order
Open the SQL Editor in the Supabase dashboard and run each file:
1. `supabase/migrations/001_schema.sql` — tables, indexes, audit trigger
2. `supabase/migrations/002_rls.sql` — row-level security for all four roles
3. `supabase/migrations/003_views.sql` — reporting views + AI read-only layer

If any statement errors, stop and fix before continuing — order matters.

## Step 3 — Verify RLS is working (do not skip)
In the SQL Editor:
```sql
select tablename, rowsecurity from pg_tables where schemaname = 'public';
```
Every table should show `rowsecurity = true`.

## Step 4 — Initialize the Next.js app (first Claude Code session)
```bash
npx create-next-app@latest attendance-app --typescript --tailwind --app
cd attendance-app
npm install @supabase/supabase-js @supabase/ssr
```
Create `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # admin import jobs + circular cron job ONLY
GEMINI_API_KEY=your-gemini-key                    # phase 7 + circular drafting
RESEND_API_KEY=your-resend-key                    # circulars feature — resend.com
RESEND_FROM_EMAIL=circulars@yourdomain.edu        # must be a domain verified in Resend
CRON_SECRET=any-random-string                     # also set on the Vercel project itself
MSG91_AUTH_KEY=your-msg91-authkey                 # WhatsApp circular delivery — msg91.com
MSG91_WHATSAPP_INTEGRATED_NUMBER=your-wa-number   # the WhatsApp number connected in MSG91
MSG91_WHATSAPP_TEMPLATE_NAME=circular_notification # must be a Meta-approved template first
MSG91_WHATSAPP_LANGUAGE_CODE=en                   # defaults to "en" if unset
```
Never commit `.env.local`. Never use the service-role key in user-facing code.

## Step 5 — Follow the phases in CLAUDE.md
One phase per Claude Code session. The file is written so Claude Code
picks up all project conventions automatically.

## Seed data
`seed-templates/students_import_template.csv` shows the exact columns the
bulk import (phase 3) should accept. Get a real section's student list from
one friendly department as early as possible — real data finds real bugs,
and having their data loaded is your pilot pitch to that HOD.

## Free-tier guardrails
- Supabase free: 500MB DB (attendance for 10k students uses tens of MB/year),
  50k monthly active users, connection pooling built in.
- Cache student percentage reads for 60s once traffic is real.
- Keep AI endpoints faculty/HOD-only to stay inside Gemini free limits.
