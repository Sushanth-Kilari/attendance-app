import { CalendarX } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { todayIST, dayOfWeekIST } from "@/lib/date";
import { QueryError } from "@/components/query-error";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// No table stores clock times per period, so there's no way to know
// whether "today's" period 5 has actually happened yet — only past dates
// can be meaningfully checked for a scheduled-but-never-started class.
function yesterdayIST(): string {
  const d = new Date(`${todayIST()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export default async function MissedClassesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: dateParam } = await searchParams;
  const maxDate = yesterdayIST();
  const date = dateParam && dateParam <= maxDate ? dateParam : maxDate;

  const supabase = await createClient();

  const { data: slots, error: slotsError } = await supabase
    .from("timetable_slots")
    .select(
      "assignment_id, period_no, profiles(full_name), sections(name, year, academic_year, departments(code)), teaching_assignments(subjects(code, name))",
    )
    .eq("day_of_week", dayOfWeekIST(date))
    .order("period_no");

  if (slotsError) return <QueryError message={slotsError.message} />;

  const assignmentIds = [...new Set((slots ?? []).map((s) => s.assignment_id))];

  const { data: sessions, error: sessionsError } =
    assignmentIds.length > 0
      ? await supabase
          .from("class_sessions")
          .select("assignment_id, period_no")
          .eq("session_date", date)
          .in("assignment_id", assignmentIds)
      : { data: [] as { assignment_id: string; period_no: number }[], error: null };

  if (sessionsError) return <QueryError message={sessionsError.message} />;

  const heldKeys = new Set((sessions ?? []).map((s) => `${s.assignment_id}:${s.period_no}`));
  const missed = (slots ?? []).filter((s) => !heldKeys.has(`${s.assignment_id}:${s.period_no}`));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Timetabled classes with no matching session on the chosen date — a day-after review, not a live alert
          (there&apos;s no clock-time mapping for periods, so today or future dates can&apos;t be checked yet).
        </p>

        <form className="flex items-center gap-2">
          <Input id="date" type="date" name="date" defaultValue={date} max={maxDate} className="w-[9.5rem]" />
          <Button type="submit" variant="outline">
            Go
          </Button>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead>Faculty</TableHead>
              <TableHead>Section</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {missed.map((slot, i) => {
              const facultyRow = Array.isArray(slot.profiles) ? slot.profiles[0] : slot.profiles;
              const section = Array.isArray(slot.sections) ? slot.sections[0] : slot.sections;
              const dept = section
                ? Array.isArray(section.departments)
                  ? section.departments[0]
                  : section.departments
                : undefined;
              const assignment = Array.isArray(slot.teaching_assignments)
                ? slot.teaching_assignments[0]
                : slot.teaching_assignments;
              const subject = assignment
                ? Array.isArray(assignment.subjects)
                  ? assignment.subjects[0]
                  : assignment.subjects
                : undefined;

              return (
                <TableRow key={i}>
                  <TableCell className="font-medium">Period {slot.period_no}</TableCell>
                  <TableCell className="text-muted-foreground">{facultyRow?.full_name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {dept?.code} {section?.year}-{section?.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {subject?.code} — {subject?.name}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="border-red-600/30 text-red-700 dark:text-red-400">
                      Missed
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
            {missed.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <CalendarX className="size-6 text-muted-foreground/60" />
                    Nothing missed on {date} — every timetabled class was held.
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
