"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; success?: boolean } | undefined;

const AREA_TYPES = ["rural", "semi_urban", "urban"];

function parseCentreFields(formData: FormData) {
  return {
    code: String(formData.get("code") ?? "").trim().toUpperCase(),
    name: String(formData.get("name") ?? "").trim(),
    state: String(formData.get("state") ?? "").trim(),
    district: String(formData.get("district") ?? "").trim(),
    area_type: String(formData.get("area_type") ?? "rural"),
  };
}

function validate(fields: ReturnType<typeof parseCentreFields>) {
  if (!fields.code || !fields.name || !fields.state || !fields.district) {
    return "Code, name, state and district are required.";
  }
  if (!AREA_TYPES.includes(fields.area_type)) return "Pick a valid area type.";
  return null;
}

export async function createCentre(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin");

  const fields = parseCentreFields(formData);
  const invalid = validate(fields);
  if (invalid) return { error: invalid };

  const supabase = await createClient();
  const { error } = await supabase.from("centres").insert(fields);
  if (error) return { error: error.message };

  revalidatePath("/admin/centres");
  return { success: true };
}

export async function updateCentre(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin");

  const id = String(formData.get("id") ?? "");
  const fields = parseCentreFields(formData);
  const invalid = !id ? "Missing centre id." : validate(fields);
  if (invalid) return { error: invalid };

  const supabase = await createClient();
  const { error } = await supabase.from("centres").update(fields).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/centres");
  return { success: true };
}

export async function deleteCentre(id: string): Promise<{ error?: string } | undefined> {
  await requireRole("admin");

  const supabase = await createClient();
  const { error } = await supabase.from("centres").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/centres");
}
