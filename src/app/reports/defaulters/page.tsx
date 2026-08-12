import { createClient } from "@/lib/supabase/server";
import { QueryError } from "@/components/query-error";
import { DefaultersTable } from "./DefaultersTable";

export default async function DefaultersPage() {
  const supabase = await createClient();
  const { data: defaulters, error } = await supabase
    .from("v_defaulters")
    .select("*")
    .order("department_code")
    .order("year")
    .order("section_name")
    .order("attendance_pct");

  if (error) {
    return <QueryError message={error.message} />;
  }

  return <DefaultersTable initialRows={defaulters ?? []} />;
}
