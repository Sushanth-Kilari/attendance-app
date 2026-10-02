// RLS boundary for centres + sanctioned inventory (022_centres_inventory.sql):
// admin writes; signed-in users read centres; only staff read inventory;
// students see no inventory and nobody but admin can write either table.
import { describe, it, expect, afterEach } from "vitest";
import { signIn, adminClient, TEST_ACCOUNTS } from "../helpers/supabase";

const TEST_CODE = "TC-RLS-TEST";

afterEach(async () => {
  // centre_inventory rows cascade with the centre.
  await adminClient().from("centres").delete().eq("code", TEST_CODE);
});

async function seedCentreWithItem() {
  const admin = adminClient();
  const { data: centre, error } = await admin
    .from("centres")
    .insert({ code: TEST_CODE, name: "RLS Test Centre", state: "Telangana", district: "Medak" })
    .select("id")
    .single();
  if (error || !centre) throw new Error(`seed centre failed: ${error?.message}`);

  const { error: itemError } = await admin
    .from("centre_inventory")
    .insert({ centre_id: centre.id, category: "workbench", item_name: "Welding bench", sanctioned_qty: 6 });
  if (itemError) throw new Error(`seed item failed: ${itemError.message}`);
  return centre.id as string;
}

describe("centres + inventory RLS", () => {
  it("lets an admin create a centre and inventory item", async () => {
    const admin = await signIn(TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
    const { data: centre, error } = await admin
      .from("centres")
      .insert({ code: TEST_CODE, name: "RLS Test Centre", state: "Telangana", district: "Medak" })
      .select("id")
      .single();
    expect(error).toBeNull();

    const { error: itemError } = await admin
      .from("centre_inventory")
      .insert({ centre_id: centre!.id, category: "seating", item_name: "Chairs", sanctioned_qty: 30 });
    expect(itemError).toBeNull();
  });

  it("blocks a faculty member from creating a centre", async () => {
    const faculty = await signIn(TEST_ACCOUNTS.faculty.email, TEST_ACCOUNTS.faculty.password);
    const { error } = await faculty
      .from("centres")
      .insert({ code: TEST_CODE, name: "Nope", state: "Telangana", district: "Medak" });
    expect(error).not.toBeNull();
  });

  it("lets a student read centres but not sanctioned inventory", async () => {
    const centreId = await seedCentreWithItem();
    const student = await signIn(TEST_ACCOUNTS.student.email, TEST_ACCOUNTS.student.password);

    const { data: centres } = await student.from("centres").select("id").eq("id", centreId);
    expect(centres).toHaveLength(1);

    const { data: items } = await student.from("centre_inventory").select("id").eq("centre_id", centreId);
    expect(items).toHaveLength(0);
  });

  it("lets a HOD read sanctioned inventory but not change it", async () => {
    const centreId = await seedCentreWithItem();
    const hod = await signIn(TEST_ACCOUNTS.hod.email, TEST_ACCOUNTS.hod.password);

    const { data: items } = await hod.from("centre_inventory").select("id, sanctioned_qty").eq("centre_id", centreId);
    expect(items).toHaveLength(1);

    await hod.from("centre_inventory").update({ sanctioned_qty: 99 }).eq("centre_id", centreId);
    const { data: after } = await adminClient().from("centre_inventory").select("sanctioned_qty").eq("centre_id", centreId);
    expect(after![0].sanctioned_qty).toBe(6);
  });
});
