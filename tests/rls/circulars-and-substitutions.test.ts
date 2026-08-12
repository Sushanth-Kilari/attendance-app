// Newer-feature RLS boundaries built this session: an HOD can only act on
// their own department's circulars, and a substitute can only act on the
// exact class+date they're covering, not other dates of the same
// assignment.
import { describe, it, expect, afterEach } from "vitest";
import { signIn, adminClient, userId, assignmentIdFor, TEST_ACCOUNTS } from "../helpers/supabase";

let circularIds: string[] = [];
let substitutionIds: string[] = [];
let sessionIds: string[] = [];

afterEach(async () => {
  const admin = adminClient();
  if (circularIds.length) await admin.from("circulars").delete().in("id", circularIds);
  if (sessionIds.length) await admin.from("class_sessions").delete().in("id", sessionIds);
  if (substitutionIds.length) await admin.from("class_substitutions").delete().in("id", substitutionIds);
  circularIds = [];
  substitutionIds = [];
  sessionIds = [];
});

describe("HOD circular access is scoped to their own department", () => {
  it("cannot see or reject another department's circular", async () => {
    const admin = adminClient();
    const hodDeptId = (await admin.from("profiles").select("department_id").eq("email", TEST_ACCOUNTS.hod.email).single()).data!.department_id;
    const { data: otherDept } = await admin.from("departments").select("id").neq("id", hodDeptId).limit(1).single();

    const { data: circular } = await admin
      .from("circulars")
      .insert({
        department_id: otherDept!.id,
        occasion_year: 2020,
        title: "Test: other-department circular",
        body: "Should not be visible to the CSE HOD.",
        status: "pending_approval",
      })
      .select("id")
      .single();
    circularIds.push(circular!.id);

    const hod = await signIn(TEST_ACCOUNTS.hod.email, TEST_ACCOUNTS.hod.password);

    const { data: seen } = await hod.from("circulars").select("id").eq("id", circular!.id);
    expect(seen).toEqual([]);

    const { data: updated } = await hod
      .from("circulars")
      .update({ status: "rejected", rejection_reason: "should not apply" })
      .eq("id", circular!.id)
      .select();
    expect(updated).toEqual([]);

    const { data: stillPending } = await admin.from("circulars").select("status").eq("id", circular!.id).single();
    expect(stillPending!.status).toBe("pending_approval");
  });
});

describe("Substitute access is scoped to the exact class + date they're covering", () => {
  it("can start the covered class on the covered date, but not on a different date", async () => {
    const admin = adminClient();
    const { assignmentId } = await assignmentIdFor(TEST_ACCOUNTS.faculty.email, "CS301", "A");
    const substituteId = await userId(TEST_ACCOUNTS.substitute.email);
    const coveredDate = "2020-02-10";
    const uncoveredDate = "2020-02-11";

    const { data: substitution } = await admin
      .from("class_substitutions")
      .insert({ assignment_id: assignmentId, session_date: coveredDate, substitute_faculty_id: substituteId, created_by: substituteId })
      .select("id")
      .single();
    substitutionIds.push(substitution!.id);

    const substitute = await signIn(TEST_ACCOUNTS.substitute.email, TEST_ACCOUNTS.substitute.password);

    const { data: coveredSession, error: coveredError } = await substitute
      .from("class_sessions")
      .insert({ assignment_id: assignmentId, session_date: coveredDate, period_no: 8, created_by: substituteId })
      .select("id")
      .single();
    expect(coveredError).toBeNull();
    sessionIds.push(coveredSession!.id);

    const { data: uncoveredSession, error: uncoveredError } = await substitute
      .from("class_sessions")
      .insert({ assignment_id: assignmentId, session_date: uncoveredDate, period_no: 8, created_by: substituteId })
      .select("id")
      .single();
    expect(uncoveredSession).toBeNull();
    expect(uncoveredError).not.toBeNull();
  });
});
