import Link from "next/link";
import { BookOpen, CalendarCheck, CalendarClock, UserCog2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { todayIST, dayOfWeekIST } from "@/lib/date";
import { QueryError } from "@/components/query-error";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StartSessionForm } from "./StartSessionForm";
import { TodayScheduleStart } from "./TodayScheduleStart";

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  held: "Held",
  cancelled: "Cancelled",
};

export default async function FacultyOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: dateParam } = await searchParams;
  const date = dateParam || todayIST();
  const isToday = date === todayIST();

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: assignments, error: assignmentsError } = await supabase
    .from("teaching_assignments")
    .select("id, subjects(code, name), sections(name, year, academic_year, departments(code))")
    .eq("faculty_id", user!.id)
    .eq("is_active", true);

  if (assignmentsError) {
    return <QueryError message={assignmentsError.message} />;
  }

  const myAssignmentIds = (assignments ?? []).map((a) => a.id);

  // Classes where I'm covering for someone else on this date.
  const { data: coveringFor, error: coveringForError } = await supabase
    .from("class_substitutions")
    .select(
      "assignment_id, teaching_assignments(subjects(code, name), sections(name, year, academic_year, departments(code)), profiles(full_name))",
    )
    .eq("substitute_faculty_id", user!.id)
    .eq("session_date", date);

  if (coveringForError) {
    return <QueryError message={coveringForError.message} />;
  }

  const coveringAssignmentIds = (coveringFor ?? []).map((c) => c.assignment_id);
  const allRelevantAssignmentIds = [...new Set([...myAssignmentIds, ...coveringAssignmentIds])];

  const { data: sessions, error: sessionsError } = await supabase
    .from("class_sessions")
    .select("id, assignment_id, period_no, status")
    .eq("session_date", date)
    .in("assignment_id", allRelevantAssignmentIds)
    .order("period_no");

  if (sessionsError) {
    return <QueryError message={sessionsError.message} />;
  }

  const sessionsByAssignment = new Map<string, typeof sessions>();
  for (const s of sessions ?? []) {
    const list = sessionsByAssignment.get(s.assignment_id) ?? [];
    list.push(s);
    sessionsByAssignment.set(s.assignment_id, list);
  }

  const { data: todaySlots, error: slotsError } = await supabase
    .from("timetable_slots")
    .select("id, assignment_id, period_no, teaching_assignments(subjects(code, name), sections(name, year, academic_year, departments(code)))")
    .eq("faculty_id", user!.id)
    .eq("day_of_week", dayOfWeekIST(date))
    .order("period_no");

  if (slotsError) {
    return <QueryError message={slotsError.message} />;
  }

  // Classes of mine that someone else is covering on this date — a note,
  // not a restriction: I still see my normal Start button either way.
  const { data: mySubstitutions, error: mySubsError } = await supabase
    .from("class_substitutions")
    .select("assignment_id, profiles!class_substitutions_substitute_faculty_id_fkey(full_name)")
    .eq("session_date", date)
    .in("assignment_id", myAssignmentIds.length ? myAssignmentIds : ["00000000-0000-0000-0000-000000000000"]);

  if (mySubsError) {
    return <QueryError message={mySubsError.message} />;
  }

  const substituteNameByAssignment = new Map(
    (mySubstitutions ?? []).map((s) => {
      const sub = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
      return [s.assignment_id, sub?.full_name];
    }),
  );

  // Resolve which period(s) each class I'm covering actually falls on
  // today, via its normal timetable slot(s) — same "timetable-only" scope
  // boundary already used by the missed-classes report.
  const { data: coveringSlots, error: coveringSlotsError } = coveringAssignmentIds.length
    ? await supabase
        .from("timetable_slots")
        .select("assignment_id, period_no")
        .in("assignment_id", coveringAssignmentIds)
        .eq("day_of_week", dayOfWeekIST(date))
    : { data: [] as { assignment_id: string; period_no: number }[], error: null };

  if (coveringSlotsError) {
    return <QueryError message={coveringSlotsError.message} />;
  }

  const coveringPeriodsByAssignment = new Map<string, number[]>();
  for (const s of coveringSlots ?? []) {
    const list = coveringPeriodsByAssignment.get(s.assignment_id) ?? [];
    list.push(s.period_no);
    coveringPeriodsByAssignment.set(s.assignment_id, list);
  }

  const coveringRows = (coveringFor ?? []).flatMap((c) => {
    const assignment = Array.isArray(c.teaching_assignments) ? c.teaching_assignments[0] : c.teaching_assignments;
    const subject = assignment ? (Array.isArray(assignment.subjects) ? assignment.subjects[0] : assignment.subjects) : undefined;
    const section = assignment ? (Array.isArray(assignment.sections) ? assignment.sections[0] : assignment.sections) : undefined;
    const department = section
      ? Array.isArray(section.departments)
        ? section.departments[0]
        : section.departments
      : undefined;
    const originalFacultyRow = assignment ? (Array.isArray(assignment.profiles) ? assignment.profiles[0] : assignment.profiles) : undefined;
    const periods = coveringPeriodsByAssignment.get(c.assignment_id) ?? [];

    return periods.map((period_no) => ({
      key: `${c.assignment_id}-${period_no}`,
      assignment_id: c.assignment_id,
      period_no,
      subject,
      section,
      department,
      originalFacultyName: originalFacultyRow?.full_name ?? "?",
      existingSession: (sessionsByAssignment.get(c.assignment_id) ?? []).find((s) => s!.period_no === period_no),
    }));
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Start a session for a period, mark the roster, submit. Change the date to mark a class late.
        </p>

        <form className="flex items-center gap-2">
          <Input id="date" type="date" name="date" defaultValue={date} max={todayIST()} className="w-[9.5rem]" />
          <Button type="submit" variant="outline">
            Go
          </Button>
        </form>
      </div>

      {!isToday && (
        <Badge variant="outline" className="w-fit border-amber-600/30 text-amber-700 dark:text-amber-400">
          Marking for {date}, not today
        </Badge>
      )}

      {coveringRows.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <UserCog2 className="size-4" />
            Covering for others {isToday ? "today" : `on ${date}`}
          </h2>
          <div className="flex flex-col gap-2">
            {coveringRows.map((row) => (
              <div
                key={row.key}
                className="flex items-center justify-between gap-3 rounded-xl border border-amber-600/30 bg-amber-500/5 p-3 shadow-sm"
              >
                <div>
                  <p className="font-medium text-foreground">
                    Period {row.period_no} · {row.subject?.code} — {row.subject?.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {row.department?.code} {row.section?.year}-{row.section?.name} ({row.section?.academic_year}) ·
                    Substituting for {row.originalFacultyName}
                  </p>
                </div>
                {row.existingSession ? (
                  <Link href={`/faculty/sessions/${row.existingSession.id}`}>
                    <Badge
                      variant="outline"
                      className="cursor-pointer gap-1.5 py-1 hover:border-primary/50 hover:bg-primary/5"
                    >
                      <CalendarCheck className="size-3" />
                      {STATUS_LABEL[row.existingSession.status] ?? row.existingSession.status}
                    </Badge>
                  </Link>
                ) : (
                  <TodayScheduleStart assignmentId={row.assignment_id} sessionDate={date} periodNo={row.period_no} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {todaySlots && todaySlots.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <CalendarClock className="size-4" />
            {isToday ? "Today's Schedule" : `Schedule for ${date}`}
          </h2>
          <div className="flex flex-col gap-2">
            {todaySlots.map((slot) => {
              const assignment = Array.isArray(slot.teaching_assignments)
                ? slot.teaching_assignments[0]
                : slot.teaching_assignments;
              const subject = assignment ? (Array.isArray(assignment.subjects) ? assignment.subjects[0] : assignment.subjects) : undefined;
              const section = assignment ? (Array.isArray(assignment.sections) ? assignment.sections[0] : assignment.sections) : undefined;
              const department = section
                ? Array.isArray(section.departments)
                  ? section.departments[0]
                  : section.departments
                : undefined;
              const existingSession = (sessionsByAssignment.get(slot.assignment_id) ?? []).find(
                (s) => s!.period_no === slot.period_no,
              );
              const substituteName = substituteNameByAssignment.get(slot.assignment_id);

              return (
                <div
                  key={slot.id}
                  className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3 shadow-sm"
                >
                  <div>
                    <p className="font-medium text-foreground">
                      Period {slot.period_no} · {subject?.code} — {subject?.name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {department?.code} {section?.year}-{section?.name} ({section?.academic_year})
                    </p>
                    {substituteName && (
                      <p className="text-xs text-amber-700 dark:text-amber-400">Covered by {substituteName}</p>
                    )}
                  </div>
                  {existingSession ? (
                    <Link href={`/faculty/sessions/${existingSession.id}`}>
                      <Badge
                        variant="outline"
                        className="cursor-pointer gap-1.5 py-1 hover:border-primary/50 hover:bg-primary/5"
                      >
                        <CalendarCheck className="size-3" />
                        {STATUS_LABEL[existingSession.status] ?? existingSession.status}
                      </Badge>
                    </Link>
                  ) : (
                    <TodayScheduleStart assignmentId={slot.assignment_id} sessionDate={date} periodNo={slot.period_no} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {todaySlots && todaySlots.length > 0 && (
        <h2 className="text-sm font-semibold text-muted-foreground">All my classes</h2>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {assignments?.map((a) => {
          const subject = Array.isArray(a.subjects) ? a.subjects[0] : a.subjects;
          const section = Array.isArray(a.sections) ? a.sections[0] : a.sections;
          const department = section
            ? Array.isArray(section.departments)
              ? section.departments[0]
              : section.departments
            : undefined;
          const todaySessions = sessionsByAssignment.get(a.id) ?? [];

          return (
            <Card key={a.id} className="shadow-sm">
              <CardHeader className="flex-row items-start gap-3 space-y-0">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <BookOpen className="size-4.5" />
                </div>
                <div>
                  <p className="font-medium text-foreground">
                    {subject?.code} — {subject?.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {department?.code} {section?.year}-{section?.name} ({section?.academic_year})
                  </p>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {todaySessions.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {todaySessions.map((s) => (
                      <Link key={s!.id} href={`/faculty/sessions/${s!.id}`}>
                        <Badge
                          variant="outline"
                          className="cursor-pointer gap-1.5 py-1 hover:border-primary/50 hover:bg-primary/5"
                        >
                          <CalendarCheck className="size-3" />
                          Period {s!.period_no} · {STATUS_LABEL[s!.status] ?? s!.status}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                )}

                <StartSessionForm
                  assignmentId={a.id}
                  sessionDate={date}
                  takenPeriods={todaySessions.map((s) => s!.period_no)}
                />
              </CardContent>
            </Card>
          );
        })}

        {assignments?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No active teaching assignments yet. Ask an admin to assign you a section and subject.
          </p>
        )}
      </div>
    </div>
  );
}
