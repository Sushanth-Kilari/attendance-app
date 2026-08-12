import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { routeQuestion, narrateResults, type QueryKind } from "@/lib/ai/gemini";

const RPC_BY_QUERY: Record<QueryKind, string> = {
  student_subject_attendance: "ai_get_student_subject_attendance",
  section_summary: "ai_get_section_summary",
  defaulters: "ai_get_defaulters",
};

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // Defense in depth: the SQL functions themselves also re-check the
  // caller's role (see migration 005), so this isn't the only gate —
  // but failing fast here avoids burning a Gemini call for a student.
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["faculty", "hod", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "AI queries are available to faculty, HOD, and admin only." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ error: "A question is required." }, { status: 400 });
  }

  let routed: Awaited<ReturnType<typeof routeQuestion>>;
  try {
    routed = await routeQuestion(question);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not interpret the question." },
      { status: 502 },
    );
  }

  const rpcName = RPC_BY_QUERY[routed.query];
  const params =
    routed.query === "student_subject_attendance"
      ? { p_department_code: routed.department_code, p_section_name: routed.section_name, p_year: routed.year }
      : { p_department_code: routed.department_code };

  const { data: rows, error: rpcError } = await supabase.rpc(rpcName, params);
  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  let answer: string;
  try {
    answer = await narrateResults(question, rows ?? []);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not generate an answer." },
      { status: 502 },
    );
  }

  return NextResponse.json({ answer, rows: rows ?? [], query: routed.query });
}
