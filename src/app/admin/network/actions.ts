"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { ipInCidr } from "@/lib/network";

export type FormState = { error?: string; success?: boolean } | undefined;

function validCidr(cidr: string): boolean {
  // ipInCidr treats a bare IP as an exact /32 match, so running it against
  // itself is a cheap, dependency-free way to validate the shape without
  // duplicating the parsing logic.
  return ipInCidr(cidr.split("/")[0], cidr);
}

export async function createNetworkRange(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin");

  const label = String(formData.get("label") ?? "").trim();
  const cidr = String(formData.get("cidr") ?? "").trim();
  if (!label || !cidr) return { error: "Label and IP/CIDR are required." };
  if (!validCidr(cidr)) return { error: "That doesn't look like a valid IP or CIDR range (e.g. 203.0.113.0/24)." };

  const supabase = await createClient();
  const { error } = await supabase.from("network_ranges").insert({ label, cidr });
  if (error) return { error: error.message };

  revalidatePath("/admin/network");
  return { success: true };
}

export async function updateNetworkRange(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin");

  const id = String(formData.get("id") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const cidr = String(formData.get("cidr") ?? "").trim();
  if (!id || !label || !cidr) return { error: "Label and IP/CIDR are required." };
  if (!validCidr(cidr)) return { error: "That doesn't look like a valid IP or CIDR range (e.g. 203.0.113.0/24)." };

  const supabase = await createClient();
  const { error } = await supabase.from("network_ranges").update({ label, cidr }).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/network");
  return { success: true };
}

export async function deleteNetworkRange(id: string): Promise<{ error?: string } | undefined> {
  await requireRole("admin");

  const supabase = await createClient();
  const { error } = await supabase.from("network_ranges").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/network");
}
