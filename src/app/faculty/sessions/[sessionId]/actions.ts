"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AttendanceStatus } from "@/lib/types";

export type SubmitResult = { error?: string; success?: boolean };

const CHECKIN_TOKEN_TTL_MS = 40_000;

export type CheckinTokenResult = { token: string; expiresAt: string } | { error: string };

// Rotates the session's self-check-in token. Called on an interval by
// CheckinQrPanel while the QR is on screen — a short TTL plus frequent
// rotation means a photographed QR is only usable for a few seconds after
// it's replaced, on top of the network restriction checked at scan time.
export async function refreshCheckinToken(sessionId: string): Promise<CheckinTokenResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const token = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + CHECKIN_TOKEN_TTL_MS).toISOString();

  const { error } = await supabase
    .from("class_sessions")
    .update({ checkin_token: token, checkin_token_expires_at: expiresAt })
    .eq("id", sessionId);

  if (error) return { error: error.message };
  return { token, expiresAt };
}

// Clears the token so a stale QR (e.g. left on a projector after class)
// stops working immediately instead of waiting out its TTL.
export async function stopCheckin(sessionId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("class_sessions")
    .update({ checkin_token: null, checkin_token_expires_at: null })
    .eq("id", sessionId);
  if (error) return { error: error.message };
  return {};
}

export async function submitAttendance(
  sessionId: string,
  records: { student_id: string; status: AttendanceStatus }[],
  topic: string = "",
): Promise<SubmitResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: existing } = await supabase
    .from("attendance_records")
    .select("id, student_id, status")
    .eq("session_id", sessionId);

  const existingByStudent = new Map((existing ?? []).map((r) => [r.student_id, r]));

  const toInsert = records
    .filter((r) => !existingByStudent.has(r.student_id))
    .map((r) => ({ session_id: sessionId, student_id: r.student_id, status: r.status, marked_by: user.id }));

  // Only touch rows whose status actually changed — cheaper, and keeps the
  // attendance_audit trigger's log limited to real corrections.
  const toUpdate = records.filter((r) => {
    const current = existingByStudent.get(r.student_id);
    return current && current.status !== r.status;
  });

  if (toInsert.length > 0) {
    const { error } = await supabase.from("attendance_records").insert(toInsert);
    if (error) return { error: error.message };
  }

  for (const r of toUpdate) {
    const current = existingByStudent.get(r.student_id)!;
    // marked_by moves to whoever made the correction — otherwise a
    // student's own QR self-check-in row would still read as
    // self-reported after a faculty override changed its actual status.
    const { error } = await supabase
      .from("attendance_records")
      .update({ status: r.status, marked_by: user.id })
      .eq("id", current.id);
    if (error) return { error: error.message };
  }

  const { error: topicError } = await supabase
    .from("class_sessions")
    .update({ topic: topic.trim() || null })
    .eq("id", sessionId);
  if (topicError) return { error: topicError.message };

  revalidatePath(`/faculty/sessions/${sessionId}`);
  return { success: true };
}
