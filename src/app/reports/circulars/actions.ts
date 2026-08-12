"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { draftCircular } from "@/lib/ai/announcements";
import { sendCircularEmails, textToHtml } from "@/lib/email/resend";
import { sendCircularWhatsApp } from "@/lib/whatsapp/msg91";
import { todayIST } from "@/lib/date";

export type ActionResult = { error?: string } | undefined;

// Loads the target circular and checks it's still awaiting this HOD's
// decision. RLS also enforces "own department, pending only" on the update
// itself, but checking here first lets us return a clear error message
// instead of a silent no-op update.
async function loadOwnPendingCircular(supabase: Awaited<ReturnType<typeof createClient>>, id: string, departmentId: string) {
  const { data, error } = await supabase
    .from("circulars")
    .select("id, department_id, status, title, body")
    .eq("id", id)
    .single();

  if (error || !data) return { error: "Circular not found." } as const;
  if (data.department_id !== departmentId) return { error: "This circular belongs to another department." } as const;
  if (data.status !== "pending_approval") return { error: "This circular has already been decided." } as const;
  return { data } as const;
}

// Approve and send are one step: nothing is emailed until this runs, and
// once it runs the row moves straight from pending_approval to sent so the
// RLS update policy (HOD may only update while pending_approval) only ever
// needs to authorize a single write.
export async function approveCircular(id: string, title: string, body: string): Promise<ActionResult> {
  const { profile } = await requireRole("hod");
  if (!profile.department_id) return { error: "Your account has no department set." };

  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();
  if (!trimmedTitle || !trimmedBody) return { error: "Title and body are required." };

  const supabase = await createClient();
  const loaded = await loadOwnPendingCircular(supabase, id, profile.department_id);
  if ("error" in loaded) return { error: loaded.error };

  const { data: students, error: studentsError } = await supabase
    .from("profiles")
    .select("email")
    .eq("role", "student")
    .eq("department_id", profile.department_id)
    .eq("is_active", true);

  if (studentsError) return { error: studentsError.message };
  const recipients = (students ?? []).map((s) => s.email);
  if (recipients.length === 0) return { error: "No active students found in your department." };

  let sent = 0;
  let failed = 0;
  try {
    ({ sent, failed } = await sendCircularEmails({
      subject: trimmedTitle,
      html: textToHtml(trimmedBody),
      recipients,
    }));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to send email." };
  }

  if (sent === 0) return { error: "Email sending failed for every recipient. The draft was left pending — try again." };

  // WhatsApp is additive and best-effort: email is the proven channel, so a
  // WhatsApp failure never blocks the send or reverts a circular that's
  // already gone out by email — it just means whatsapp_sent_count is 0.
  let whatsappSent = 0;
  let whatsappFailed = 0;
  const { data: activeStudentProfiles } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "student")
    .eq("department_id", profile.department_id)
    .eq("is_active", true);

  const activeStudentIds = (activeStudentProfiles ?? []).map((p) => p.id);
  const { data: studentsWithPhone } = activeStudentIds.length
    ? await supabase.from("students").select("phone_number").in("user_id", activeStudentIds).not("phone_number", "is", null)
    : { data: [] as { phone_number: string | null }[] };

  const phoneRecipients = (studentsWithPhone ?? [])
    .map((s) => s.phone_number)
    .filter((phone): phone is string => Boolean(phone));

  try {
    ({ sent: whatsappSent, failed: whatsappFailed } = await sendCircularWhatsApp({
      title: trimmedTitle,
      body: trimmedBody,
      recipients: phoneRecipients,
    }));
  } catch {
    whatsappSent = 0;
    whatsappFailed = phoneRecipients.length;
  }

  const { error: updateError } = await supabase
    .from("circulars")
    .update({
      title: trimmedTitle,
      body: trimmedBody,
      status: "sent",
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
      sent_at: new Date().toISOString(),
      recipient_count: sent,
      failed_count: failed,
      whatsapp_sent_count: whatsappSent,
      whatsapp_failed_count: whatsappFailed,
    })
    .eq("id", id);

  if (updateError) return { error: updateError.message };

  revalidatePath("/reports/circulars");
  return undefined;
}

export async function rejectCircular(id: string, reason: string): Promise<ActionResult> {
  const { profile } = await requireRole("hod");
  if (!profile.department_id) return { error: "Your account has no department set." };

  const supabase = await createClient();
  const loaded = await loadOwnPendingCircular(supabase, id, profile.department_id);
  if ("error" in loaded) return { error: loaded.error };

  const { error } = await supabase
    .from("circulars")
    .update({
      status: "rejected",
      rejection_reason: reason.trim() || null,
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/reports/circulars");
  return undefined;
}

export async function createManualCircular(title: string, body: string): Promise<ActionResult> {
  const { profile } = await requireRole("hod");
  if (!profile.department_id) return { error: "Your account has no department set." };

  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();
  if (!trimmedTitle || !trimmedBody) return { error: "Title and body are required." };

  const supabase = await createClient();
  const [year] = todayIST().split("-").map(Number);

  const { error } = await supabase.from("circulars").insert({
    department_id: profile.department_id,
    important_date_id: null,
    occasion_year: year,
    title: trimmedTitle,
    body: trimmedBody,
    status: "pending_approval",
    created_by: profile.id,
  });

  if (error) return { error: error.message };

  revalidatePath("/reports/circulars");
  return undefined;
}

export async function draftCircularWithAI(occasion: string): Promise<{ title: string; body: string; error?: string }> {
  await requireRole("hod");

  const trimmed = occasion.trim();
  if (!trimmed) return { title: "", body: "", error: "Describe the occasion first." };

  const draft = await draftCircular(trimmed);
  return draft;
}
