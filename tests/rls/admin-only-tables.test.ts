// Confirms non-admin roles can't write to admin-managed reference/config
// tables. Each insert is expected to fail (RLS denies it) — success would
// be the bug. Payloads use real reference ids where needed so a failure
// can only be attributed to RLS, not a missing-column error.
import { describe, it, expect } from "vitest";
import { signIn, adminClient, assignmentIdFor, TEST_ACCOUNTS } from "../helpers/supabase";

async function refs() {
  const admin = adminClient();
  const { data: department } = await admin.from("departments").select("id").eq("code", "CSE").single();
  const { data: section } = await admin.from("sections").select("id").eq("department_id", department!.id).limit(1).single();
  const a = await assignmentIdFor(TEST_ACCOUNTS.faculty.email, "CS301", "A");
  return { departmentId: department!.id, sectionId: section!.id, assignmentId: a.assignmentId, facultyId: a.facultyId };
}

describe.each([
  { role: "faculty", account: TEST_ACCOUNTS.faculty },
  { role: "student", account: TEST_ACCOUNTS.student },
])("$role cannot write to admin-only tables", ({ account }) => {
  it("cannot insert a department", async () => {
    const client = await signIn(account.email, account.password);
    const { error } = await client.from("departments").insert({ code: "ZZZ", name: "Should Not Insert" });
    expect(error).not.toBeNull();
  });

  it("cannot insert a section", async () => {
    const { departmentId } = await refs();
    const client = await signIn(account.email, account.password);
    const { error } = await client.from("sections").insert({ department_id: departmentId, year: 1, name: "ZZ", academic_year: "1900-01" });
    expect(error).not.toBeNull();
  });

  it("cannot insert a subject", async () => {
    const { departmentId } = await refs();
    const client = await signIn(account.email, account.password);
    const { error } = await client.from("subjects").insert({ department_id: departmentId, code: "ZZ999", name: "Should Not Insert", semester: 1 });
    expect(error).not.toBeNull();
  });

  it("cannot insert a timetable slot", async () => {
    const { assignmentId, sectionId, facultyId } = await refs();
    const client = await signIn(account.email, account.password);
    const { error } = await client
      .from("timetable_slots")
      .insert({ assignment_id: assignmentId, faculty_id: facultyId, section_id: sectionId, day_of_week: 1, period_no: 9 });
    expect(error).not.toBeNull();
  });

  it("cannot insert an important date", async () => {
    const client = await signIn(account.email, account.password);
    const { error } = await client.from("important_dates").insert({ title: "Should Not Insert", occasion_month: 1, occasion_day: 1 });
    expect(error).not.toBeNull();
  });

  it("cannot insert a class substitution", async () => {
    const { assignmentId, facultyId } = await refs();
    const client = await signIn(account.email, account.password);
    const { error } = await client
      .from("class_substitutions")
      .insert({ assignment_id: assignmentId, session_date: "2020-01-01", substitute_faculty_id: facultyId, created_by: facultyId });
    expect(error).not.toBeNull();
  });
});
