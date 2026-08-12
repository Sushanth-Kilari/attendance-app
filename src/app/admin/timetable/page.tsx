import { CalendarClock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { QueryError } from "@/components/query-error";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TimetableForm } from "./TimetableForm";
import { deleteTimetableSlot } from "./actions";

const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function TimetablePage() {
  const supabase = await createClient();

  const [{ data: faculty, error: facultyError }, { data: sections, error: sectionsError }, { data: subjects, error: subjectsError }, { data: slots, error: slotsError }] =
    await Promise.all([
      supabase.from("profiles").select("id, full_name").eq("role", "faculty").order("full_name"),
      supabase
        .from("sections")
        .select("id, name, year, academic_year, departments(code)")
        .order("year")
        .order("name"),
      supabase.from("subjects").select("id, code, name").order("code"),
      supabase
        .from("timetable_slots")
        .select(
          "id, day_of_week, period_no, profiles(full_name), sections(name, year, academic_year, departments(code)), teaching_assignments(subjects(code, name))",
        )
        .order("day_of_week")
        .order("period_no"),
    ]);

  const error = facultyError || sectionsError || subjectsError || slotsError;
  if (error) {
    return <QueryError message={error.message} />;
  }

  const sectionOptions = (sections ?? []).map((s) => {
    const dept = Array.isArray(s.departments) ? s.departments[0] : s.departments;
    return { id: s.id, label: `${dept?.code} ${s.year}-${s.name} (${s.academic_year})` };
  });

  const subjectOptions = (subjects ?? []).map((s) => ({ id: s.id, label: `${s.code} — ${s.name}` }));

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Schedule which faculty teaches which section/subject on which day and period. Adding a slot creates the
        underlying teaching assignment automatically if it doesn&apos;t already exist. Faculty see today&apos;s
        matching slots pre-filled on their{" "}
        <span className="font-medium text-foreground">My Classes</span> page.
      </p>

      <TimetableForm faculty={faculty ?? []} sections={sectionOptions} subjects={subjectOptions} />

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Day</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Faculty</TableHead>
              <TableHead>Section</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead className="w-16 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {slots?.map((slot) => {
              const facultyRow = Array.isArray(slot.profiles) ? slot.profiles[0] : slot.profiles;
              const section = Array.isArray(slot.sections) ? slot.sections[0] : slot.sections;
              const dept = section ? (Array.isArray(section.departments) ? section.departments[0] : section.departments) : undefined;
              const assignment = Array.isArray(slot.teaching_assignments)
                ? slot.teaching_assignments[0]
                : slot.teaching_assignments;
              const subject = assignment ? (Array.isArray(assignment.subjects) ? assignment.subjects[0] : assignment.subjects) : undefined;

              return (
                <TableRow key={slot.id}>
                  <TableCell className="font-medium">{DAY_NAMES[slot.day_of_week]}</TableCell>
                  <TableCell className="text-muted-foreground">Period {slot.period_no}</TableCell>
                  <TableCell className="text-muted-foreground">{facultyRow?.full_name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {dept?.code} {section?.year}-{section?.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {subject?.code} — {subject?.name}
                  </TableCell>
                  <TableCell className="text-right">
                    <ConfirmDeleteButton
                      id={slot.id}
                      description="Remove this timetable slot? Faculty will no longer see it pre-filled — this doesn't affect any sessions already held."
                      action={deleteTimetableSlot}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
            {slots?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <CalendarClock className="size-6 text-muted-foreground/60" />
                    No timetable slots yet.
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
