"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; success?: boolean } | undefined;
export type KeyState = { error?: string; key?: string } | undefined;

export async function createCamera(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin");

  const centre_id = String(formData.get("centre_id") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const section_id = String(formData.get("section_id") ?? "") || null;
  if (!centre_id || !label) return { error: "Centre and camera label are required." };
  if (label.length > 80) return { error: "Camera label must be 80 characters or fewer." };

  const supabase = await createClient();
  const { error } = await supabase.from("centre_cameras").insert({ centre_id, label, section_id });
  if (error) {
    // 23505 = unique (centre_id, label)
    if (error.code === "23505") return { error: "This centre already has a camera with that label." };
    return { error: error.message };
  }

  revalidatePath("/admin/cameras");
  return { success: true };
}

export async function deleteCamera(id: string): Promise<{ error?: string } | undefined> {
  await requireRole("admin");

  const supabase = await createClient();
  const { error } = await supabase.from("centre_cameras").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/cameras");
}

// Returns the plaintext ingest key exactly once; the database keeps only its
// SHA-256 hash, so it cannot be shown again — rotating issues a new key and
// immediately invalidates the old one.
export async function rotateIngestKey(_prev: KeyState, formData: FormData): Promise<KeyState> {
  await requireRole("admin");

  const centre_id = String(formData.get("centre_id") ?? "");
  if (!centre_id) return { error: "Missing centre." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rotate_centre_ingest_key", { p_centre_id: centre_id });
  if (error) return { error: error.message };

  return { key: data as string };
}
