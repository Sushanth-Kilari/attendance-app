// Video-observation ingest + discrepancy engine (023_video_observations.sql).
// Runs against the live test project, so every fixture is throwaway and
// removed in afterEach. Requires migrations 021-023 to be applied.
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { signIn, adminClient, userId, TEST_ACCOUNTS } from "../helpers/supabase";

const CENTRE_CODE = "TC-ENGINE-TEST";
const DAY = "2020-03-16"; // dedicated past marker date, never used by real data
const CAMERA = "Engine-Cam-1";
const STUDENT_COUNT = 10;

let centreId: string;
let sectionId: string;
let ingestKey: string;
let sessionId: string;
let assignmentId: string;
let studentIds: string[] = [];

function anon(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
}

function ingest(over: Record<string, unknown> = {}) {
  return anon().rpc("ingest_video_observation", {
    p_centre_code: CENTRE_CODE,
    p_ingest_key: ingestKey,
    p_camera_label: CAMERA,
    p_observed_at: `${DAY}T09:30:00+05:30`, // inside period 1 (09:00-10:00 IST)
    p_person_count: 3,
    p_equipment: {},
    ...over,
  });
}

async function discrepancies() {
  const { data } = await adminClient().from("discrepancies").select("*").eq("centre_id", centreId);
  return data ?? [];
}

beforeEach(async () => {
  const admin = adminClient();

  const { data: centre, error } = await admin
    .from("centres")
    .insert({ code: CENTRE_CODE, name: "Engine Test Centre", state: "Telangana", district: "Medak" })
    .select("id")
    .single();
  if (error || !centre) throw new Error(`centre: ${error?.message}`);
  centreId = centre.id;

  const adminUser = await signIn(TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
  const { data: key, error: keyError } = await adminUser.rpc("rotate_centre_ingest_key", { p_centre_id: centreId });
  if (keyError) throw new Error(`rotate key: ${keyError.message}`);
  ingestKey = key as string;

  const { data: subject } = await admin.from("subjects").select("id, department_id").eq("code", "CS301").single();
  const { data: section, error: sectionError } = await admin
    .from("sections")
    .insert({ department_id: subject!.department_id, year: 6, name: "ENG", academic_year: "2020-21", centre_id: centreId })
    .select("id")
    .single();
  if (sectionError || !section) throw new Error(`section: ${sectionError?.message}`);
  sectionId = section.id;

  await admin.from("centre_cameras").insert({ centre_id: centreId, label: CAMERA, section_id: sectionId });

  const facultyId = await userId(TEST_ACCOUNTS.faculty.email);
  const { data: assignment, error: assignmentError } = await admin
    .from("teaching_assignments")
    .insert({ faculty_id: facultyId, section_id: sectionId, subject_id: subject!.id, semester: "ENGINE-TEST" })
    .select("id")
    .single();
  if (assignmentError || !assignment) throw new Error(`assignment: ${assignmentError?.message}`);
  assignmentId = assignment.id;

  const { data: session, error: sessionError } = await admin
    .from("class_sessions")
    .insert({ assignment_id: assignmentId, session_date: DAY, period_no: 1, created_by: facultyId })
    .select("id")
    .single();
  if (sessionError || !session) throw new Error(`session: ${sessionError?.message}`);
  sessionId = session.id;

  studentIds = [];
  for (let i = 0; i < STUDENT_COUNT; i++) {
    const email = `engine.test.${i}@attendance.test`;
    const { data: user, error: userError } = await admin.auth.admin.createUser({
      email,
      password: "TestPass123!",
      email_confirm: true,
    });
    if (userError || !user.user) throw new Error(`user ${i}: ${userError?.message}`);
    const id = user.user.id;
    await admin.from("profiles").insert({ id, full_name: `Engine Student ${i}`, email, role: "student" });
    await admin.from("students").insert({ user_id: id, roll_no: `ENG-${i}`, section_id: sectionId, batch: "2020-24" });
    studentIds.push(id);
  }
});

afterEach(async () => {
  const admin = adminClient();
  // attendance rows cascade with the session; students must go before the section.
  await admin.from("class_sessions").delete().eq("id", sessionId);
  await admin.from("teaching_assignments").delete().eq("id", assignmentId);
  for (const id of studentIds) await admin.auth.admin.deleteUser(id); // cascades profiles -> students
  await admin.from("sections").delete().eq("id", sectionId);
  await admin.from("centres").delete().eq("id", centreId); // cascades keys, cameras, observations, discrepancies
});

async function markAllPresent(count = STUDENT_COUNT) {
  const facultyId = await userId(TEST_ACCOUNTS.faculty.email);
  const rows = studentIds
    .slice(0, count)
    .map((student_id) => ({ session_id: sessionId, student_id, status: "present", marked_by: facultyId }));
  const { error } = await adminClient().from("attendance_records").insert(rows);
  if (error) throw new Error(`attendance: ${error.message}`);
}

describe("ingest authentication", () => {
  it("rejects a wrong ingest key and an unknown centre identically", async () => {
    const bad = await ingest({ p_ingest_key: "not-the-key" });
    const unknown = await ingest({ p_centre_code: "TC-DOES-NOT-EXIST" });
    expect(bad.error?.code).toBe("28000");
    expect(unknown.error?.code).toBe("28000");
    expect(bad.error?.message).toBe(unknown.error?.message);
  });

  it("stores nothing for a rejected request", async () => {
    await ingest({ p_ingest_key: "not-the-key" });
    const { data } = await adminClient().from("video_observations").select("id").eq("centre_id", centreId);
    expect(data).toHaveLength(0);
  });

  it("treats a replayed observation as a duplicate, not a second row", async () => {
    const first = await ingest();
    const second = await ingest();
    expect(first.data.status).toBe("stored");
    expect(second.data.status).toBe("duplicate");
  });
});

describe("attendance_mismatch", () => {
  it("flags a centre that claims far more present than the cameras saw, even if attendance is marked AFTER the footage", async () => {
    // Cameras first: head-count 3 = instructor + 2 trainees. No claim yet, so nothing to compare.
    const r = await ingest({ p_person_count: 3 });
    expect(r.data.session_id).toBe(sessionId);
    expect(await discrepancies()).toHaveLength(0);

    // Late marking: the centre now claims all 10 present.
    await markAllPresent();
    const found = (await discrepancies()).filter((d) => d.kind === "attendance_mismatch");
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ severity: "high", claimed_count: 10, observed_count: 2, status: "open" });
  });

  it("does not flag a claim within occlusion tolerance", async () => {
    // Peak 10 incl. instructor = 9 trainees vs 10 claimed: shortfall 1 <= tolerance 2.
    await ingest({ p_person_count: 10 });
    await markAllPresent();
    expect((await discrepancies()).filter((d) => d.kind === "attendance_mismatch")).toHaveLength(0);
  });

  it("clears the finding when a later observation shows the room was full (peak, not average)", async () => {
    await ingest({ p_person_count: 3 });
    await markAllPresent();
    expect((await discrepancies()).filter((d) => d.kind === "attendance_mismatch")).toHaveLength(1);

    await ingest({ p_observed_at: `${DAY}T09:45:00+05:30`, p_person_count: 11 });
    const after = (await discrepancies()).filter((d) => d.kind === "attendance_mismatch");
    expect(after[0].status).toBe("resolved");
  });

  it("re-evaluates when a faculty correction lowers the claim", async () => {
    await ingest({ p_person_count: 3 });
    await markAllPresent();
    await adminClient().from("attendance_records").update({ status: "absent" }).eq("session_id", sessionId);
    const after = (await discrepancies()).filter((d) => d.kind === "attendance_mismatch");
    expect(after[0].status).toBe("resolved");
  });
});

describe("infrastructure checks", () => {
  beforeEach(async () => {
    await adminClient().from("centre_inventory").insert([
      { centre_id: centreId, category: "seating", item_name: "Chairs", sanctioned_qty: 30 },
      { centre_id: centreId, category: "workbench", item_name: "Welding bench", sanctioned_qty: 6 },
      { centre_id: centreId, category: "machinery", item_name: "CNC lathe", sanctioned_qty: 2 },
    ]);
  });

  it("flags missing equipment against the sanctioned quantity, and ignores items the worker did not report", async () => {
    await ingest({ p_person_count: 5, p_equipment: { "Welding bench": 2 } }); // CNC lathe not reported
    const eq = (await discrepancies()).filter((d) => d.kind === "equipment_missing");
    expect(eq).toHaveLength(1);
    expect(eq[0]).toMatchObject({ item_name: "Welding bench", claimed_count: 6, observed_count: 2, severity: "medium" });
  });

  it("flags equipment present but not operating", async () => {
    await ingest({ p_person_count: 5, p_equipment: { "CNC lathe": { count: 2, operating: 0 } } });
    const op = (await discrepancies()).filter((d) => d.kind === "equipment_nonfunctional");
    expect(op).toHaveLength(1);
    expect(op[0].severity).toBe("high");
  });

  it("flags a head-count above sanctioned seating", async () => {
    await ingest({ p_person_count: 40 });
    const cap = (await discrepancies()).filter((d) => d.kind === "capacity_exceeded");
    expect(cap).toHaveLength(1);
    expect(cap[0]).toMatchObject({ claimed_count: 30, observed_count: 40, severity: "medium" });
  });

  it("updates one finding per day instead of flooding with a row per observation", async () => {
    await ingest({ p_observed_at: `${DAY}T11:00:00+05:30`, p_person_count: 5, p_equipment: { "Welding bench": 1 } });
    await ingest({ p_observed_at: `${DAY}T11:05:00+05:30`, p_person_count: 5, p_equipment: { "Welding bench": 3 } });
    const eq = (await discrepancies()).filter((d) => d.kind === "equipment_missing");
    expect(eq).toHaveLength(1);
    expect(eq[0].observed_count).toBe(3); // peak seen that day
  });
});

describe("who can read what", () => {
  it("hides observations, discrepancies and ingest keys from anon and from students", async () => {
    await ingest({ p_person_count: 40 });
    const student = await signIn(TEST_ACCOUNTS.student.email, TEST_ACCOUNTS.student.password);

    for (const client of [anon(), student]) {
      for (const table of ["video_observations", "discrepancies", "centre_ingest_keys"]) {
        const { data } = await client.from(table).select("*").eq("centre_id", centreId);
        expect(data ?? []).toHaveLength(0);
      }
    }
  });

  it("stops anon from writing observations directly", async () => {
    const { error } = await anon()
      .from("video_observations")
      .insert({ centre_id: centreId, observed_at: new Date().toISOString(), person_count: 1 });
    expect(error).not.toBeNull();
  });

  it("stops a non-admin from rotating an ingest key", async () => {
    const faculty = await signIn(TEST_ACCOUNTS.faculty.email, TEST_ACCOUNTS.faculty.password);
    const { error } = await faculty.rpc("rotate_centre_ingest_key", { p_centre_id: centreId });
    expect(error).not.toBeNull();
  });

  it("invalidates the old key when a new one is issued", async () => {
    const oldKey = ingestKey;
    const adminUser = await signIn(TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
    const { data: newKey } = await adminUser.rpc("rotate_centre_ingest_key", { p_centre_id: centreId });
    ingestKey = oldKey;
    expect((await ingest()).error?.code).toBe("28000");
    ingestKey = newKey as string;
    expect((await ingest()).error).toBeNull();
  });
});
