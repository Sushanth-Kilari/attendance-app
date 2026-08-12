"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; success?: boolean } | undefined;

export async function createSubstitution(_prev: FormState, formData: FormData): Promise<FormState> {
  const { profile } = await requireRole("admin");

  const assignment_id = String(formData.get("assignment_id") ?? "");
  const session_date = String(formData.get("session_date") ?? "");
  const substitute_faculty_id = String(formData.get("substitute_faculty_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!assignment_id || !session_date || !substitute_faculty_id) {
    return { error: "Assignment, date, and substitute are all required." };
  }

  const supabase = await createClient();

  const { data: assignment } = await supabase
    .from("teaching_assignments")
    .select("faculty_id")
    .eq("id", assignment_id)
    .single();

  if (assignment?.faculty_id === substitute_faculty_id) {
    return { error: "Pick someone other than the assigned faculty." };
  }

  const { error } = await supabase.from("class_substitutions").insert({
    assignment_id,
    session_date,
    substitute_faculty_id,
    reason: reason || null,
    created_by: profile.id,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "A substitute is already arranged for this class on that date." };
    }
    return { error: error.message };
  }

  revalidatePath("/admin/substitutions");
  return { success: true };
}

export async function deleteSubstitution(id: string): Promise<{ error?: string } | undefined> {
  await requireRole("admin");

  const supabase = await createClient();
  const { error } = await supabase.from("class_substitutions").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/substitutions");
}
