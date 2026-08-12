"use server";

import { headers } from "next/headers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { getClientIp, isIpAllowed } from "@/lib/network";

export type CheckinResult = { error?: string; success?: boolean; alreadyMarked?: boolean; subjectCode?: string };

export async function selfCheckIn(sessionId: string, token: string): Promise<CheckinResult> {
  const { user } = await requireRole("student");
  const supabase = await createClient();

  const { data: session, error: sessionError } = await supabase
    .from("class_sessions")
    .select("checkin_token, checkin_token_expires_at, teaching_assignments(subjects(code))")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError) return { error: sessionError.message };
  if (!session) return { error: "This class isn't available to you." };

  if (!session.checkin_token || session.checkin_token !== token) {
    return { error: "This QR code is invalid or has expired. Ask your faculty to show it again." };
  }
  if (!session.checkin_token_expires_at || new Date(session.checkin_token_expires_at) < new Date()) {
    return { error: "This QR code has expired. Ask your faculty to refresh it." };
  }

  const headersList = await headers();
  const ip = getClientIp(headersList);

  const { data: ranges, error: rangesError } = await supabase.from("network_ranges").select("cidr");
  if (rangesError) return { error: rangesError.message };

  if (!isIpAllowed(ip, ranges ?? [])) {
    return { error: "You must be connected to the college network to check in." };
  }

  const { error: insertError } = await supabase
    .from("attendance_records")
    .insert({ session_id: sessionId, student_id: user.id, status: "present", marked_by: user.id });

  const assignment = Array.isArray(session.teaching_assignments) ? session.teaching_assignments[0] : session.teaching_assignments;
  const subject = assignment ? (Array.isArray(assignment.subjects) ? assignment.subjects[0] : assignment.subjects) : undefined;

  if (insertError) {
    // 23505 = unique_violation on (session_id, student_id) — they were
    // already marked (by faculty, or an earlier scan). Not a real error.
    if (insertError.code === "23505") return { success: true, alreadyMarked: true, subjectCode: subject?.code };
    return { error: insertError.message };
  }

  return { success: true, subjectCode: subject?.code };
}
