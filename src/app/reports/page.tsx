import { createClient } from "@/lib/supabase/server";
import { QueryError } from "@/components/query-error";
import { SectionSummaryTable } from "./SectionSummaryTable";

export default async function ReportsOverviewPage() {
  const supabase = await createClient();
  const { data: summary, error } = await supabase
    .from("v_section_summary")
    .select("*")
    .order("department_code")
    .order("year")
    .order("section_name")
    .order("subject_code");

  if (error) {
    return <QueryError message={error.message} />;
  }

  return <SectionSummaryTable initialRows={summary ?? []} />;
}
