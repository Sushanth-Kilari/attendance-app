import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { draftCircular } from "@/lib/ai/announcements";
import { todayIST } from "@/lib/date";

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function occurrenceFor(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Runs daily via Vercel Cron (see vercel.json). For each active important
// date, checks whether "today + lead_days" lands on this year's or next
// year's occurrence, and if so drafts one circular per department that
// doesn't already have one for that (date, year) pair — nothing sends until
// an HOD approves it at /reports/circulars.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Service-role client: a scheduled job has no request-bound user session
  // for RLS to authorize as. This is the second deliberate exception to
  // CLAUDE.md's "service-role key is for admin import jobs only" rule (see
  // createAdminClient's own comment) — the only other place in the app that
  // legitimately has nobody logged in to act as.
  const supabase = createAdminClient();

  const today = todayIST();
  const [todayYear] = today.split("-").map(Number);

  const { data: importantDates, error: idErr } = await supabase
    .from("important_dates")
    .select("id, title, occasion_month, occasion_day, lead_days")
    .eq("is_active", true);
  if (idErr) return NextResponse.json({ error: idErr.message }, { status: 500 });

  const { data: departments, error: deptErr } = await supabase.from("departments").select("id");
  if (deptErr) return NextResponse.json({ error: deptErr.message }, { status: 500 });

  let created = 0;
  let skipped = 0;

  for (const importantDate of importantDates ?? []) {
    // Check both this year's and next year's occurrence — covers dates that
    // already passed this year, whose next occurrence is next year.
    const candidates = [todayYear, todayYear + 1].map((year) => ({
      year,
      date: occurrenceFor(year, importantDate.occasion_month, importantDate.occasion_day),
    }));
    const match = candidates.find((c) => addDays(today, importantDate.lead_days) === c.date);
    if (!match) continue;

    const { data: existing } = await supabase
      .from("circulars")
      .select("department_id")
      .eq("important_date_id", importantDate.id)
      .eq("occasion_year", match.year);
    const covered = new Set((existing ?? []).map((r) => r.department_id));

    const missing = (departments ?? []).filter((d) => !covered.has(d.id));
    skipped += covered.size;
    if (missing.length === 0) continue;

    const draft = await draftCircular(importantDate.title, formatLabel(match.date));

    const { error: insertErr } = await supabase.from("circulars").insert(
      missing.map((d) => ({
        important_date_id: importantDate.id,
        department_id: d.id,
        occasion_year: match.year,
        title: draft.title,
        body: draft.body,
        status: "pending_approval" as const,
      })),
    );
    if (insertErr) {
      return NextResponse.json({ error: insertErr.message, created, skipped }, { status: 500 });
    }
    created += missing.length;
  }

  return NextResponse.json({ created, skipped });
}
