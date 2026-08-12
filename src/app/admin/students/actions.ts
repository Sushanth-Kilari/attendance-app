"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseCsv } from "@/lib/csv";

type ImportRowResult = {
  roll_no: string;
  email: string;
  status: "created" | "skipped" | "failed";
  detail: string;
  temp_password?: string;
};

export type ImportState = { results: ImportRowResult[] } | undefined;

const PASSWORD_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

function randomPassword(length = 12) {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += PASSWORD_CHARS[Math.floor(Math.random() * PASSWORD_CHARS.length)];
  }
  return out;
}

const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;

// Optional column: blank/absent is fine (returns null, row proceeds).
// If provided, normalizes bare 10-digit Indian numbers to E.164 by
// assuming a +91 country code, then validates the result — matches the
// DB check constraint in migration 008.
function normalizePhone(raw: string | undefined): { value: string | null; error?: string } {
  const trimmed = raw?.trim();
  if (!trimmed) return { value: null };

  const digitsOnly = trimmed.replace(/[\s-]/g, "");
  const candidate = digitsOnly.startsWith("+")
    ? digitsOnly
    : digitsOnly.length === 10
      ? `+91${digitsOnly}`
      : `+${digitsOnly}`;

  if (!PHONE_PATTERN.test(candidate)) {
    return { value: null, error: `Invalid phone number "${raw}".` };
  }
  return { value: candidate };
}

export async function importStudents(_prev: ImportState, formData: FormData): Promise<ImportState> {
  await requireRole("admin");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { results: [{ roll_no: "-", email: "-", status: "failed", detail: "No file uploaded." }] };
  }

  const text = await file.text();
  const rows = parseCsv(text);

  if (rows.length === 0) {
    return { results: [{ roll_no: "-", email: "-", status: "failed", detail: "CSV has no data rows." }] };
  }

  const supabase = await createClient();
  // Service-role client, used only for the one thing RLS structurally can't
  // do: creating auth.users rows. The admin role has already been confirmed
  // above via requireRole(); everything else in this loop runs through the
  // normal RLS-checked client.
  const admin = createAdminClient();

  const { data: departments } = await supabase.from("departments").select("id, code");
  const deptByCode = new Map((departments ?? []).map((d) => [d.code, d.id]));

  const sectionCache = new Map<string, string>();
  const results: ImportRowResult[] = [];

  for (const row of rows) {
    const roll_no = row.roll_no?.trim();
    const full_name = row.full_name?.trim();
    const email = row.email?.trim().toLowerCase();
    const department_code = row.department_code?.trim();
    const year = Number(row.year);
    const section_name = row.section_name?.trim().toUpperCase();
    const academic_year = row.academic_year?.trim();
    const batch = row.batch?.trim();

    if (!roll_no || !full_name || !email || !department_code || !year || !section_name || !academic_year || !batch) {
      results.push({ roll_no: roll_no || "?", email: email || "?", status: "failed", detail: "Missing required column(s)." });
      continue;
    }

    const phone = normalizePhone(row.phone);
    if (phone.error) {
      results.push({ roll_no, email, status: "failed", detail: phone.error });
      continue;
    }

    const department_id = deptByCode.get(department_code);
    if (!department_id) {
      results.push({ roll_no, email, status: "failed", detail: `Unknown department_code "${department_code}". Create it first.` });
      continue;
    }

    const sectionKey = `${department_id}|${year}|${section_name}|${academic_year}`;
    let sectionId = sectionCache.get(sectionKey);

    if (!sectionId) {
      const { data: existingSection } = await supabase
        .from("sections")
        .select("id")
        .eq("department_id", department_id)
        .eq("year", year)
        .eq("name", section_name)
        .eq("academic_year", academic_year)
        .maybeSingle();

      if (existingSection) {
        sectionId = existingSection.id;
      } else {
        const { data: newSection, error: sectionErr } = await supabase
          .from("sections")
          .insert({ department_id, year, name: section_name, academic_year })
          .select("id")
          .single();

        if (sectionErr || !newSection) {
          results.push({ roll_no, email, status: "failed", detail: `Could not create section: ${sectionErr?.message}` });
          continue;
        }
        sectionId = newSection.id;
      }

      if (!sectionId) {
        results.push({ roll_no, email, status: "failed", detail: "Could not resolve section id." });
        continue;
      }

      sectionCache.set(sectionKey, sectionId);
    }

    const temp_password = randomPassword();

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: temp_password,
      email_confirm: true,
    });

    if (createErr) {
      const alreadyExists = /already.*registered|already.*exists/i.test(createErr.message);
      results.push({ roll_no, email, status: alreadyExists ? "skipped" : "failed", detail: createErr.message });
      continue;
    }

    const userId = created.user.id;

    const { error: profileErr } = await supabase.from("profiles").insert({
      id: userId,
      full_name,
      email,
      role: "student",
      department_id,
    });

    if (profileErr) {
      results.push({ roll_no, email, status: "failed", detail: `Auth user created but profile insert failed: ${profileErr.message}` });
      continue;
    }

    const { error: studentErr } = await supabase.from("students").insert({
      user_id: userId,
      roll_no,
      section_id: sectionId,
      batch,
      phone_number: phone.value,
    });

    if (studentErr) {
      results.push({ roll_no, email, status: "failed", detail: `Profile created but student row failed: ${studentErr.message}` });
      continue;
    }

    results.push({ roll_no, email, status: "created", detail: "Account created.", temp_password });
  }

  revalidatePath("/admin/students");
  return { results };
}

export async function toggleStudentActive(formData: FormData) {
  await requireRole("admin");

  const userId = String(formData.get("user_id") ?? "");
  const next = formData.get("next") === "true";

  const supabase = await createClient();
  await supabase.from("profiles").update({ is_active: next }).eq("id", userId);

  revalidatePath("/admin/students");
}
