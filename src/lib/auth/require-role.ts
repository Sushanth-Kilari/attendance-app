import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/types";

// Page/action-level role gate. Defense in depth on top of RLS: this keeps
// non-admins from ever rendering /admin/* or invoking its server actions,
// while RLS is still the actual security boundary underneath.
export async function requireRole(...roles: AppRole[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, department_id")
    .eq("id", user.id)
    .single();

  if (!profile || !roles.includes(profile.role as AppRole)) {
    redirect("/dashboard");
  }

  return { user, profile };
}
