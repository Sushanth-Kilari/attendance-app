"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; success?: boolean } | undefined;

function parseSectionFields(formData: FormData) {
  return {
    department_id: String(formData.get("department_id") ?? ""),
    year: Number(formData.get("year")),
    name: String(formData.get("name") ?? "").trim().toUpperCase(),
    academic_year: String(formData.get("academic_year") ?? "").trim(),
  };
}

export async function createSection(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin");

  const fields = parseSectionFields(formData);
  if (!fields.department_id || !fields.year || !fields.name || !fields.academic_year) {
    return { error: "All fields are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("sections").insert(fields);
  if (error) return { error: error.message };

  revalidatePath("/admin/sections");
  return { success: true };
}

export async function updateSection(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin");

  const id = String(formData.get("id") ?? "");
  const fields = parseSectionFields(formData);
  if (!id || !fields.department_id || !fields.year || !fields.name || !fields.academic_year) {
    return { error: "All fields are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("sections").update(fields).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/sections");
  return { success: true };
}

export async function deleteSection(id: string): Promise<{ error?: string } | undefined> {
  await requireRole("admin");

  const supabase = await createClient();
  const { error } = await supabase.from("sections").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/sections");
}
