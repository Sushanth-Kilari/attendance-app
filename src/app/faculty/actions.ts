"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string } | undefined;

export async function startSession(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireRole("faculty");

  const assignmentId = String(formData.get("assignment_id") ?? "");
  const sessionDate = String(formData.get("session_date") ?? "");
  const periodNo = Number(formData.get("period_no"));

  if (!assignmentId || !sessionDate || !periodNo) {
    return { error: "Pick a period first." };
  }

  const supabase = await createClient();

  // Reuse an existing session for this assignment/date/period instead of
  // erroring on the unique constraint — faculty may click "Start" again
  // after navigating away without submitting.
  const { data: existing } = await supabase
    .from("class_sessions")
    .select("id")
    .eq("assignment_id", assignmentId)
    .eq("session_date", sessionDate)
    .eq("period_no", periodNo)
    .maybeSingle();

  if (existing) {
    redirect(`/faculty/sessions/${existing.id}`);
  }

  const { data: session, error } = await supabase
    .from("class_sessions")
    .insert({ assignment_id: assignmentId, session_date: sessionDate, period_no: periodNo, created_by: user.id })
    .select("id")
    .single();

  if (error || !session) {
    return { error: error?.message ?? "Could not create session." };
  }

  redirect(`/faculty/sessions/${session.id}`);
}
