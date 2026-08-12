// The exact 5 scenarios from CLAUDE.md's "Testing scenarios that must pass
// before pilot" — as real, repeatable tests instead of one-off manual
// checks. All fixtures are throwaway rows on a dedicated far-past test
// date that real usage will never touch, cleaned up in afterEach.
import { describe, it, expect, afterEach } from "vitest";
import { signIn, adminClient, userId, assignmentIdFor, TEST_ACCOUNTS } from "../helpers/supabase";

const TEST_DATE = "2020-01-06"; // dedicated marker date, never used by real data
const assignmentFor = (section: string) => assignmentIdFor(TEST_ACCOUNTS.faculty.email, "CS301", section);

let createdSessionIds: string[] = [];

afterEach(async () => {
  if (createdSessionIds.length === 0) return;
  await adminClient().from("class_sessions").delete().in("id", createdSessionIds); // cascades attendance_records + attendance_audit
  createdSessionIds = [];
});

describe("1. Faculty teaching two sections of the same subject", () => {
  it("keeps attendance for section A and section B independent", async () => {
    const faculty = await signIn(TEST_ACCOUNTS.faculty.email, TEST_ACCOUNTS.faculty.password);
    const facultyId = await userId(TEST_ACCOUNTS.faculty.email);
    const a = await assignmentFor("A");
    const b = await assignmentFor("B");

    const { data: sessionA, error: errA } = await faculty
      .from("class_sessions")
      .insert({ assignment_id: a.assignmentId, session_date: TEST_DATE, period_no: 1, created_by: facultyId })
      .select("id")
      .single();
    expect(errA).toBeNull();
    createdSessionIds.push(sessionA!.id);

    const { data: sessionB, error: errB } = await faculty
      .from("class_sessions")
      .insert({ assignment_id: b.assignmentId, session_date: TEST_DATE, period_no: 2, created_by: facultyId })
      .select("id")
      .single();
    expect(errB).toBeNull();
    createdSessionIds.push(sessionB!.id);

    const { data: studentsA } = await adminClient().from("students").select("user_id").eq("section_id", a.sectionId).limit(1);
    const { data: studentsB } = await adminClient().from("students").select("user_id").eq("section_id", b.sectionId).limit(1);
    const studentA = studentsA![0].user_id;
    const studentB = studentsB![0].user_id;

    const { error: recErrA } = await faculty
      .from("attendance_records")
      .insert({ session_id: sessionA!.id, student_id: studentA, status: "present", marked_by: facultyId });
    expect(recErrA).toBeNull();
    const { error: recErrB } = await faculty
      .from("attendance_records")
      .insert({ session_id: sessionB!.id, student_id: studentB, status: "absent", marked_by: facultyId });
    expect(recErrB).toBeNull();

    const { data: recordsA } = await faculty.from("attendance_records").select("student_id, status").eq("session_id", sessionA!.id);
    const { data: recordsB } = await faculty.from("attendance_records").select("student_id, status").eq("session_id", sessionB!.id);

    expect(recordsA).toEqual([{ student_id: studentA, status: "present" }]);
    expect(recordsB).toEqual([{ student_id: studentB, status: "absent" }]);
  });
});

describe("2. Student transferring sections mid-semester", () => {
  it("keeps pre-transfer attendance history resolvable after the transfer", async () => {
    const admin = adminClient();
    const studentId = await userId(TEST_ACCOUNTS.student.email);
    const facultyId = await userId(TEST_ACCOUNTS.faculty.email);
    const { data: before } = await admin.from("students").select("section_id").eq("user_id", studentId).single();
    const originalSectionId = before!.section_id;

    // A real mid-semester transfer moves a student to another section
    // *within the same department* (e.g. CSE 3-A -> 3-B), not across
    // departments — cross-department transfers land on a differently
    // scoped subject_id entirely (subject codes are only unique per
    // department) and aren't what this scenario is about.
    const { data: originalSection } = await admin.from("sections").select("department_id").eq("id", originalSectionId).single();
    const { data: otherSection } = await admin
      .from("sections")
      .select("id")
      .eq("department_id", originalSection!.department_id)
      .neq("id", originalSectionId)
      .limit(1)
      .single();

    // Build a controlled fixture instead of relying on ambient seeded data:
    // total_sessions for a subject can legitimately shift with the
    // student's *current* section (the view's CTE ties "held-but-unmarked"
    // session counts to the current-section teaching assignment), so a
    // comparison must use attendance we create and fully account for
    // ourselves, not whatever happens to already exist.
    const a = await assignmentFor("A");
    const { data: session } = await admin
      .from("class_sessions")
      .insert({ assignment_id: a.assignmentId, session_date: TEST_DATE, period_no: 5, created_by: facultyId })
      .select("id")
      .single();
    createdSessionIds.push(session!.id);
    const { error: recErr } = await admin
      .from("attendance_records")
      .insert({ session_id: session!.id, student_id: studentId, status: "present", marked_by: facultyId });
    if (recErr) throw recErr;

    const { data: preTransferRow } = await admin
      .from("v_student_subject_attendance")
      .select("subject_code, total_sessions, attended_sessions")
      .eq("student_id", studentId)
      .eq("subject_id", (await admin.from("subjects").select("id").eq("code", "CS301").eq("department_id", originalSection!.department_id).single()).data!.id)
      .single();

    await admin.from("students").update({ section_id: otherSection!.id }).eq("user_id", studentId);

    try {
      const student = await signIn(TEST_ACCOUNTS.student.email, TEST_ACCOUNTS.student.password);
      const { data: postTransferRow, error } = await student
        .from("v_student_subject_attendance")
        .select("subject_code, total_sessions, attended_sessions")
        .eq("subject_code", "CS301")
        .single();

      expect(error).toBeNull();
      // Pre-transfer session counts must still be there after the section
      // change — this is exactly the migration 006 regression this checks.
      expect(postTransferRow).toEqual(preTransferRow);
    } finally {
      await admin.from("students").update({ section_id: originalSectionId }).eq("user_id", studentId);
    }
  });
});

describe("3. Marking attendance a day late", () => {
  it("allows creating a session for a past date", async () => {
    const faculty = await signIn(TEST_ACCOUNTS.faculty.email, TEST_ACCOUNTS.faculty.password);
    const facultyId = await userId(TEST_ACCOUNTS.faculty.email);
    const a = await assignmentFor("A");

    const { data, error } = await faculty
      .from("class_sessions")
      .insert({ assignment_id: a.assignmentId, session_date: TEST_DATE, period_no: 3, created_by: facultyId })
      .select("id")
      .single();

    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
    createdSessionIds.push(data!.id);
  });
});

describe("4. Correcting a submitted record", () => {
  it("logs an audit row when a faculty changes a submitted status", async () => {
    const faculty = await signIn(TEST_ACCOUNTS.faculty.email, TEST_ACCOUNTS.faculty.password);
    const facultyId = await userId(TEST_ACCOUNTS.faculty.email);
    const a = await assignmentFor("A");
    const student = (await adminClient().from("students").select("user_id").eq("section_id", a.sectionId).limit(1).single()).data!;

    const { data: session } = await faculty
      .from("class_sessions")
      .insert({ assignment_id: a.assignmentId, session_date: TEST_DATE, period_no: 4, created_by: facultyId })
      .select("id")
      .single();
    createdSessionIds.push(session!.id);

    const { data: record } = await faculty
      .from("attendance_records")
      .insert({ session_id: session!.id, student_id: student.user_id, status: "present", marked_by: facultyId })
      .select("id")
      .single();

    const { error: updateErr } = await faculty.from("attendance_records").update({ status: "absent" }).eq("id", record!.id);
    expect(updateErr).toBeNull();

    // attendance_audit is readable only by hod/admin (migration 002) — a
    // faculty client would correctly get zero rows back via RLS here, so
    // this must read as hod to actually exercise the "row must appear" check.
    const hod = await signIn(TEST_ACCOUNTS.hod.email, TEST_ACCOUNTS.hod.password);
    const { data: auditRows, error } = await hod.from("attendance_audit").select("old_status, new_status").eq("record_id", record!.id);

    expect(error).toBeNull();
    expect(auditRows).toEqual([{ old_status: "present", new_status: "absent" }]);
  });
});

describe("5. A student querying another student's attendance", () => {
  it("returns zero rows instead of an error", async () => {
    const student = await signIn(TEST_ACCOUNTS.student.email, TEST_ACCOUNTS.student.password);
    const myId = await userId(TEST_ACCOUNTS.student.email);
    const { data: otherStudent } = await adminClient().from("profiles").select("id").eq("role", "student").neq("id", myId).limit(1).single();

    const { data, error } = await student.from("attendance_records").select("id").eq("student_id", otherStudent!.id);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
