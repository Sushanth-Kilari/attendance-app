import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const TEST_ACCOUNTS = {
  admin: { email: "phase3.test.admin@attendance.test", password: "TestPass123!" },
  hod: { email: "phase5.test.hod@attendance.test", password: "NjsCHTEVctaC" },
  faculty: { email: "phase2.test.faculty@attendance.test", password: "TestPass123!" },
  student: { email: "phase5.test.student@attendance.test", password: "TestPass123!" },
  substitute: { email: "phase12.test.substitute@attendance.test", password: "PGTGdTNPVEcD" },
} as const;

// A fresh anon-key client signed in as a real user — this is the only
// client type that actually exercises RLS the way a real logged-in user
// would. Never use adminClient() to assert what a test is checking.
export async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(URL, ANON_KEY, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn(${email}) failed: ${error.message}`);
  return client;
}

// Service-role client — bypasses RLS entirely. Setup/teardown of ephemeral
// test fixtures only, never for assertions (a service-role read proves
// nothing about whether RLS actually restricts a real user).
export function adminClient(): SupabaseClient {
  return createClient(URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function userId(email: string): Promise<string> {
  const { data, error } = await adminClient().from("profiles").select("id").eq("email", email).single();
  if (error || !data) throw new Error(`Could not resolve user id for ${email}: ${error?.message}`);
  return data.id;
}

// Filters only on real columns (subject_id, faculty_id) — never filter on
// an embedded relation's column directly, PostgREST doesn't reliably
// apply it without an explicit !inner join hint.
export async function assignmentIdFor(
  facultyEmail: string,
  subjectCode: string,
  sectionName: string,
): Promise<{ assignmentId: string; sectionId: string; facultyId: string }> {
  const admin = adminClient();
  const facultyId = await userId(facultyEmail);
  const { data: subject } = await admin.from("subjects").select("id").eq("code", subjectCode).single();
  const { data: assignments, error } = await admin
    .from("teaching_assignments")
    .select("id, section_id, sections(name)")
    .eq("subject_id", subject!.id)
    .eq("faculty_id", facultyId);
  if (error) throw error;

  const match = (assignments ?? []).find((a) => {
    const section = Array.isArray(a.sections) ? a.sections[0] : a.sections;
    return section?.name === sectionName;
  });
  if (!match) throw new Error(`No ${subjectCode} assignment found for ${facultyEmail} × section ${sectionName}`);
  return { assignmentId: match.id, sectionId: match.section_id, facultyId };
}
