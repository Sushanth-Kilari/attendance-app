"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; success?: boolean } | undefined;

export async function createDepartment(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin");

  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  if (!code || !name) return { error: "Code and name are required." };

  const supabase = await createClient();
  const { error } = await supabase.from("departments").insert({ code, name });
  if (error) return { error: error.message };

  revalidatePath("/admin/departments");
  return { success: true };
}

export async function updateDepartment(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin");

  const id = String(formData.get("id") ?? "");
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !code || !name) return { error: "Code and name are required." };

  const supabase = await createClient();
  const { error } = await supabase.from("departments").update({ code, name }).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/departments");
  return { success: true };
}

export async function deleteDepartment(id: string): Promise<{ error?: string } | undefined> {
  await requireRole("admin");

  const supabase = await createClient();
  const { error } = await supabase.from("departments").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/departments");
}
