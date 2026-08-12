"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; success?: boolean } | undefined;

function parseSubjectFields(formData: FormData) {
  return {
    department_id: String(formData.get("department_id") ?? ""),
    code: String(formData.get("code") ?? "").trim().toUpperCase(),
    name: String(formData.get("name") ?? "").trim(),
    semester: Number(formData.get("semester")),
  };
}

export async function createSubject(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin");

  const fields = parseSubjectFields(formData);
  if (!fields.department_id || !fields.code || !fields.name || !fields.semester) {
    return { error: "All fields are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("subjects").insert(fields);
  if (error) return { error: error.message };

  revalidatePath("/admin/subjects");
  return { success: true };
}

export async function updateSubject(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin");

  const id = String(formData.get("id") ?? "");
  const fields = parseSubjectFields(formData);
  if (!id || !fields.department_id || !fields.code || !fields.name || !fields.semester) {
    return { error: "All fields are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("subjects").update(fields).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/subjects");
  return { success: true };
}

export async function deleteSubject(id: string): Promise<{ error?: string } | undefined> {
  await requireRole("admin");

  const supabase = await createClient();
  const { error } = await supabase.from("subjects").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/subjects");
}
