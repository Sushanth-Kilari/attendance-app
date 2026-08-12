"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppRole } from "@/lib/types";

export type AddStaffState =
  | { error: string; success?: never }
  | { success: true; email: string; tempPassword: string; error?: never }
  | undefined;

const STAFF_ROLES: AppRole[] = ["faculty", "hod", "admin"];

const PASSWORD_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

function randomPassword(length = 12) {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += PASSWORD_CHARS[Math.floor(Math.random() * PASSWORD_CHARS.length)];
  }
  return out;
}

export async function addStaff(_prev: AddStaffState, formData: FormData): Promise<AddStaffState> {
  await requireRole("admin");

  const full_name = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "") as AppRole;
  const department_id = String(formData.get("department_id") ?? "") || null;

  if (!full_name || !email || !STAFF_ROLES.includes(role)) {
    return { error: "Name, email, and a valid role are required." };
  }

  const supabase = await createClient();
  const admin = createAdminClient();

  const tempPassword = randomPassword();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });

  if (createErr) {
    return { error: createErr.message };
  }

  const { error: profileErr } = await supabase.from("profiles").insert({
    id: created.user.id,
    full_name,
    email,
    role,
    department_id,
  });

  if (profileErr) {
    return { error: `Auth user created but profile insert failed: ${profileErr.message}` };
  }

  revalidatePath("/admin/staff");
  return { success: true, email, tempPassword };
}

export async function toggleStaffActive(formData: FormData) {
  await requireRole("admin");

  const userId = String(formData.get("user_id") ?? "");
  const next = formData.get("next") === "true";

  const supabase = await createClient();
  await supabase.from("profiles").update({ is_active: next }).eq("id", userId);

  revalidatePath("/admin/staff");
}
