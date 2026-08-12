import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { QueryError } from "@/components/query-error";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const STATUS_VARIANT: Record<string, string> = {
  present: "border-green-600/30 text-green-700 dark:text-green-400",
  absent: "border-red-600/30 text-red-700 dark:text-red-400",
  late: "border-amber-600/30 text-amber-700 dark:text-amber-400",
  on_duty: "border-blue-600/30 text-blue-700 dark:text-blue-400",
};

export default async function StudentSubjectPage({ params }: { params: Promise<{ subjectId: string }> }) {
  const { subjectId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: summary, error: summaryError } = await supabase
    .from("v_student_subject_attendance")
    .select("*")
    .eq("student_id", user!.id)
    .eq("subject_id", subjectId)
    .maybeSingle();

  if (summaryError) {
    return <QueryError message={summaryError.message} />;
  }

  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("section_id")
    .eq("user_id", user!.id)
    .single();

  if (studentError) {
    return <QueryError message={studentError.message} />;
  }

  const { data: assignments, error: assignmentsError } = await supabase
    .from("teaching_assignments")
    .select("id")
    .eq("subject_id", subjectId)
    .eq("section_id", student?.section_id ?? "");

  if (assignmentsError) {
    return <QueryError message={assignmentsError.message} />;
  }

  const assignmentIds = (assignments ?? []).map((a) => a.id);

  const { data: sessions, error: sessionsError } = assignmentIds.length
    ? await supabase
        .from("class_sessions")
        .select("id, session_date, period_no, topic, attendance_records(status)")
        .in("assignment_id", assignmentIds)
        .order("session_date", { ascending: false })
        .order("period_no", { ascending: false })
    : { data: [], error: null };

  if (sessionsError) {
    return <QueryError message={sessionsError.message} />;
  }

  if (!summary) {
    return (
      <div className="flex flex-col gap-6">
        <Link
          href="/student"
          className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to overview
        </Link>
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          No attendance data for this subject yet.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/student"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to overview
      </Link>

      <div>
        <h2 className="text-lg font-semibold text-foreground">
          {summary.subject_code} — {summary.subject_name}
        </h2>
        <p className="text-sm text-muted-foreground">
          {summary.department_code} {summary.year}-{summary.section_name}
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-semibold text-foreground">{summary.attendance_pct ?? "—"}%</span>
          <span className="text-sm text-muted-foreground">
            {summary.attended_sessions} / {summary.total_sessions} sessions
          </span>
        </div>
        <Progress value={summary.attendance_pct ?? 0} />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Topic</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions?.map((s) => {
              const record = Array.isArray(s.attendance_records) ? s.attendance_records[0] : s.attendance_records;
              return (
                <TableRow key={s.id}>
                  <TableCell>{s.session_date}</TableCell>
                  <TableCell>{s.period_no}</TableCell>
                  <TableCell className="text-muted-foreground">{s.topic || "—"}</TableCell>
                  <TableCell>
                    {record ? (
                      <Badge variant="outline" className={STATUS_VARIANT[record.status]}>
                        {record.status}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        not marked
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {(sessions?.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  No sessions recorded yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
