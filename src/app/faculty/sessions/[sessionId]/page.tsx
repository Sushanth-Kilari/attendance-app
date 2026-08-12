import { CalendarClock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { QueryError } from "@/components/query-error";
import { Badge } from "@/components/ui/badge";
import { RosterForm } from "./RosterForm";
import type { AttendanceStatus } from "@/lib/types";

export default async function SessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const supabase = await createClient();

  const { data: session, error: sessionError } = await supabase
    .from("class_sessions")
    .select(
      "id, session_date, period_no, status, topic, teaching_assignments(section_id, subjects(code, name), sections(name, year, academic_year, departments(code)))",
    )
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError) {
    return <QueryError message={sessionError.message} />;
  }

  if (!session) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        Session not found, or it isn&apos;t one of your classes.
      </div>
    );
  }

  const assignment = Array.isArray(session.teaching_assignments)
    ? session.teaching_assignments[0]
    : session.teaching_assignments;
  const subject = assignment ? (Array.isArray(assignment.subjects) ? assignment.subjects[0] : assignment.subjects) : undefined;
  const section = assignment ? (Array.isArray(assignment.sections) ? assignment.sections[0] : assignment.sections) : undefined;
  const department = section
    ? Array.isArray(section.departments)
      ? section.departments[0]
      : section.departments
    : undefined;

  const { data: students, error: studentsError } = await supabase
    .from("students")
    .select("user_id, roll_no, profiles(full_name)")
    .eq("section_id", assignment?.section_id)
    .order("roll_no");

  if (studentsError) {
    return <QueryError message={studentsError.message} />;
  }

  const { data: existingRecords, error: recordsError } = await supabase
    .from("attendance_records")
    .select("student_id, status, marked_by")
    .eq("session_id", sessionId);

  if (recordsError) {
    return <QueryError message={recordsError.message} />;
  }

  const existingByStudent = Object.fromEntries(
    (existingRecords ?? []).map((r) => [r.student_id, r.status as AttendanceStatus]),
  );

  // Self-check-in rows are inserted with marked_by = the student's own id
  // (see selfCheckIn in src/app/checkin) — faculty-marked rows always have
  // a different marked_by, so this equality is what distinguishes "scanned
  // the QR" from "faculty marked/defaulted them".
  const checkedInViaQr = Object.fromEntries(
    (existingRecords ?? []).filter((r) => r.marked_by === r.student_id).map((r) => [r.student_id, true]),
  );

  const rosterStudents = (students ?? []).map((s) => {
    const profile = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
    return { user_id: s.user_id, roll_no: s.roll_no, full_name: profile?.full_name ?? "?" };
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {subject?.code} — {subject?.name}
          </h2>
          <p className="text-sm text-muted-foreground">
            {department?.code} {section?.year}-{section?.name} ({section?.academic_year})
          </p>
        </div>
        <Badge variant="secondary" className="gap-1.5">
          <CalendarClock className="size-3.5" />
          {session.session_date} · Period {session.period_no}
        </Badge>
      </div>

      <RosterForm
        sessionId={session.id}
        students={rosterStudents}
        existingStatuses={existingByStudent}
        checkedInViaQr={checkedInViaQr}
        alreadySubmitted={(existingRecords?.length ?? 0) > 0}
        initialTopic={session.topic ?? ""}
      />
    </div>
  );
}
