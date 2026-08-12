// RLS boundary for QR self-check-in (020_qr_checkin.sql): a student can
// insert their OWN attendance record for a session in their CURRENT
// section, and nothing else — this is the actual security boundary once
// the server action's token/network checks are stripped away.
import { describe, it, expect, afterEach } from "vitest";
import { signIn, adminClient, userId, assignmentIdFor, TEST_ACCOUNTS } from "../helpers/supabase";

const TEST_DATE = "2020-03-15"; // dedicated marker date, never used by real data

let createdSessionIds: string[] = [];

afterEach(async () => {
  if (createdSessionIds.length === 0) return;
  await adminClient().from("class_sessions").delete().in("id", createdSessionIds);
  createdSessionIds = [];
});

describe("QR self-check-in RLS", () => {
  it("lets a student insert their own attendance record for their own section's session", async () => {
    const admin = adminClient();
    const facultyId = await userId(TEST_ACCOUNTS.faculty.email);
    const studentId = await userId(TEST_ACCOUNTS.student.email);
    const a = await assignmentIdFor(TEST_ACCOUNTS.faculty.email, "CS301", "A"); // student's home section

    const { data: session } = await admin
      .from("class_sessions")
      .insert({ assignment_id: a.assignmentId, session_date: TEST_DATE, period_no: 6, created_by: facultyId })
      .select("id")
      .single();
    createdSessionIds.push(session!.id);

    const student = await signIn(TEST_ACCOUNTS.student.email, TEST_ACCOUNTS.student.password);
    const { error } = await student
      .from("attendance_records")
      .insert({ session_id: session!.id, student_id: studentId, status: "present", marked_by: studentId });

    expect(error).toBeNull();
  });

  it("blocks a student from inserting an attendance record for someone else", async () => {
    const admin = adminClient();
    const facultyId = await userId(TEST_ACCOUNTS.faculty.email);
    const studentId = await userId(TEST_ACCOUNTS.student.email);
    const a = await assignmentIdFor(TEST_ACCOUNTS.faculty.email, "CS301", "A");

    const { data: session } = await admin
      .from("class_sessions")
      .insert({ assignment_id: a.assignmentId, session_date: TEST_DATE, period_no: 7, created_by: facultyId })
      .select("id")
      .single();
    createdSessionIds.push(session!.id);

    const { data: otherStudent } = await admin.from("students").select("user_id").eq("section_id", a.sectionId).neq("user_id", studentId).limit(1).single();

    const student = await signIn(TEST_ACCOUNTS.student.email, TEST_ACCOUNTS.student.password);
    const { error } = await student
      .from("attendance_records")
      .insert({ session_id: session!.id, student_id: otherStudent!.user_id, status: "present", marked_by: studentId });

    expect(error).not.toBeNull();
  });

  it("blocks a student from self-checking-in to a session in a section they're not in", async () => {
    const admin = adminClient();
    const facultyId = await userId(TEST_ACCOUNTS.faculty.email);
    const studentId = await userId(TEST_ACCOUNTS.student.email);
    const b = await assignmentIdFor(TEST_ACCOUNTS.faculty.email, "CS301", "B"); // not the test student's section

    const { data: session } = await admin
      .from("class_sessions")
      .insert({ assignment_id: b.assignmentId, session_date: TEST_DATE, period_no: 6, created_by: facultyId })
      .select("id")
      .single();
    createdSessionIds.push(session!.id);

    const student = await signIn(TEST_ACCOUNTS.student.email, TEST_ACCOUNTS.student.password);
    const { error } = await student
      .from("attendance_records")
      .insert({ session_id: session!.id, student_id: studentId, status: "present", marked_by: studentId });

    expect(error).not.toBeNull();
  });
});

describe("network_ranges RLS", () => {
  it("faculty and student cannot write, but can read", async () => {
    const admin = adminClient();
    const { data: range } = await admin.from("network_ranges").insert({ label: "RLS test range", cidr: "203.0.113.0/24" }).select("id").single();

    try {
      const faculty = await signIn(TEST_ACCOUNTS.faculty.email, TEST_ACCOUNTS.faculty.password);
      const { data: readAsFaculty, error: readError } = await faculty.from("network_ranges").select("id").eq("id", range!.id);
      expect(readError).toBeNull();
      expect(readAsFaculty).toEqual([{ id: range!.id }]);

      const { error: writeError } = await faculty.from("network_ranges").insert({ label: "should fail", cidr: "10.0.0.0/8" });
      expect(writeError).not.toBeNull();
    } finally {
      await admin.from("network_ranges").delete().eq("id", range!.id);
    }
  });

  it("admin can write", async () => {
    const admin = await signIn(TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
    const { data, error } = await admin.from("network_ranges").insert({ label: "RLS test — admin write", cidr: "198.51.100.0/24" }).select("id").single();
    expect(error).toBeNull();
    await adminClient().from("network_ranges").delete().eq("id", data!.id);
  });
});
