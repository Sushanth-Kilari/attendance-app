"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; success?: boolean } | undefined;

function parseFields(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const occasion_month = Number(formData.get("occasion_month"));
  const occasion_day = Number(formData.get("occasion_day"));
  const lead_days = Number(formData.get("lead_days"));

  if (!title) return { error: "Title is required." } as const;
  if (!Number.isInteger(occasion_month) || occasion_month < 1 || occasion_month > 12) {
    return { error: "Month must be between 1 and 12." } as const;
  }
  if (!Number.isInteger(occasion_day) || occasion_day < 1 || occasion_day > 31) {
    return { error: "Day must be between 1 and 31." } as const;
  }
  if (!Number.isInteger(lead_days) || lead_days < 0) {
    return { error: "Lead days must be 0 or more." } as const;
  }
  return { title, occasion_month, occasion_day, lead_days } as const;
}

export async function createImportantDate(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin");

  const parsed = parseFields(formData);
  if ("error" in parsed) return parsed;

  const supabase = await createClient();
  const { error } = await supabase.from("important_dates").insert(parsed);
  if (error) return { error: error.message };

  revalidatePath("/admin/important-dates");
  return { success: true };
}

export async function updateImportantDate(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin");

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing id." };

  const parsed = parseFields(formData);
  if ("error" in parsed) return parsed;

  const supabase = await createClient();
  const { error } = await supabase.from("important_dates").update(parsed).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/important-dates");
  return { success: true };
}

export async function toggleImportantDateActive(id: string, isActive: boolean): Promise<{ error?: string } | undefined> {
  await requireRole("admin");

  const supabase = await createClient();
  const { error } = await supabase.from("important_dates").update({ is_active: isActive }).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/important-dates");
}

export async function deleteImportantDate(id: string): Promise<{ error?: string } | undefined> {
  await requireRole("admin");

  const supabase = await createClient();
  const { error } = await supabase.from("important_dates").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/important-dates");
}
