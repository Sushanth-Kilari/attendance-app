"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; success?: boolean } | undefined;

export async function createTimetableSlot(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin");

  const faculty_id = String(formData.get("faculty_id") ?? "");
  const section_id = String(formData.get("section_id") ?? "");
  const subject_id = String(formData.get("subject_id") ?? "");
  const semester = String(formData.get("semester") ?? "").trim();
  const day_of_week = Number(formData.get("day_of_week"));
  const period_no = Number(formData.get("period_no"));

  if (!faculty_id || !section_id || !subject_id || !semester) {
    return { error: "Faculty, section, subject, and semester are all required." };
  }
  if (!Number.isInteger(day_of_week) || day_of_week < 1 || day_of_week > 6) {
    return { error: "Pick a day." };
  }
  if (!Number.isInteger(period_no) || period_no < 1 || period_no > 10) {
    return { error: "Pick a period." };
  }

  const supabase = await createClient();

  // Find-or-create the underlying teaching_assignment — there's no
  // separate admin UI for these today, so the timetable form doubles as
  // the way they get created.
  const { data: existingAssignment } = await supabase
    .from("teaching_assignments")
    .select("id")
    .eq("faculty_id", faculty_id)
    .eq("section_id", section_id)
    .eq("subject_id", subject_id)
    .eq("semester", semester)
    .maybeSingle();

  let assignmentId = existingAssignment?.id;

  if (!assignmentId) {
    const { data: newAssignment, error: assignmentErr } = await supabase
      .from("teaching_assignments")
      .insert({ faculty_id, section_id, subject_id, semester })
      .select("id")
      .single();

    if (assignmentErr || !newAssignment) {
      return { error: assignmentErr?.message ?? "Could not create the teaching assignment." };
    }
    assignmentId = newAssignment.id;
  }

  const { error: slotErr } = await supabase.from("timetable_slots").insert({
    assignment_id: assignmentId,
    faculty_id,
    section_id,
    day_of_week,
    period_no,
  });

  if (slotErr) {
    if (slotErr.code === "23505") {
      const message = slotErr.message.includes("faculty_id")
        ? "That faculty is already teaching another class in this period."
        : "That section already has a class in this period.";
      return { error: message };
    }
    return { error: slotErr.message };
  }

  revalidatePath("/admin/timetable");
  return { success: true };
}

export async function deleteTimetableSlot(id: string): Promise<{ error?: string } | undefined> {
  await requireRole("admin");

  const supabase = await createClient();
  const { error } = await supabase.from("timetable_slots").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/timetable");
}
