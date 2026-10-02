"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; success?: boolean } | undefined;

const CATEGORIES = ["seating", "workbench", "machinery", "computer", "other"];

function parseItemFields(formData: FormData) {
  return {
    centre_id: String(formData.get("centre_id") ?? ""),
    category: String(formData.get("category") ?? ""),
    item_name: String(formData.get("item_name") ?? "").trim(),
    sanctioned_qty: Number(formData.get("sanctioned_qty")),
  };
}

function validate(fields: ReturnType<typeof parseItemFields>) {
  if (!fields.centre_id || !fields.item_name) return "Centre and item name are required.";
  if (!CATEGORIES.includes(fields.category)) return "Pick a valid category.";
  if (!Number.isInteger(fields.sanctioned_qty) || fields.sanctioned_qty < 0) {
    return "Sanctioned quantity must be a whole number, 0 or more.";
  }
  return null;
}

export async function createInventoryItem(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin");

  const fields = parseItemFields(formData);
  const invalid = validate(fields);
  if (invalid) return { error: invalid };

  const supabase = await createClient();
  const { error } = await supabase.from("centre_inventory").insert(fields);
  if (error) {
    // 23505 = unique (centre_id, item_name)
    if (error.code === "23505") return { error: "This centre already has an item with that name." };
    return { error: error.message };
  }

  revalidatePath("/admin/inventory");
  return { success: true };
}

export async function updateInventoryItem(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin");

  const id = String(formData.get("id") ?? "");
  const fields = parseItemFields(formData);
  const invalid = !id ? "Missing item id." : validate(fields);
  if (invalid) return { error: invalid };

  const supabase = await createClient();
  const { error } = await supabase.from("centre_inventory").update(fields).eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "This centre already has an item with that name." };
    return { error: error.message };
  }

  revalidatePath("/admin/inventory");
  return { success: true };
}

export async function deleteInventoryItem(id: string): Promise<{ error?: string } | undefined> {
  await requireRole("admin");

  const supabase = await createClient();
  const { error } = await supabase.from("centre_inventory").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/inventory");
}
