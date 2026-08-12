import { UserCog2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { QueryError } from "@/components/query-error";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SubstitutionForm } from "./SubstitutionForm";
import { deleteSubstitution } from "./actions";

export default async function SubstitutionsPage() {
  const supabase = await createClient();

  const [{ data: assignments, error: assignmentsError }, { data: faculty, error: facultyError }, { data: subs, error: subsError }] =
    await Promise.all([
      supabase
        .from("teaching_assignments")
        .select("id, profiles(full_name), sections(name, year, departments(code)), subjects(code)")
        .eq("is_active", true),
      supabase.from("profiles").select("id, full_name").eq("role", "faculty").order("full_name"),
      supabase
        .from("class_substitutions")
        .select(
          "id, session_date, reason, profiles!class_substitutions_substitute_faculty_id_fkey(full_name), teaching_assignments(profiles(full_name), sections(name, year, departments(code)), subjects(code))",
        )
        .order("session_date", { ascending: false }),
    ]);

  const error = assignmentsError || facultyError || subsError;
  if (error) {
    return <QueryError message={error.message} />;
  }

  const assignmentOptions = (assignments ?? []).map((a) => {
    const facultyRow = Array.isArray(a.profiles) ? a.profiles[0] : a.profiles;
    const section = Array.isArray(a.sections) ? a.sections[0] : a.sections;
    const dept = section ? (Array.isArray(section.departments) ? section.departments[0] : section.departments) : undefined;
    const subject = Array.isArray(a.subjects) ? a.subjects[0] : a.subjects;
    return {
      id: a.id,
      label: `${facultyRow?.full_name} · ${dept?.code} ${section?.year}-${section?.name} · ${subject?.code}`,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Arrange for a different faculty to cover a specific class on a specific date. The substitute gets the same
        rights as the assigned faculty for that one class — starting the session, marking attendance, and logging
        the topic — without permanently changing who teaches it.
      </p>

      <SubstitutionForm assignments={assignmentOptions} faculty={faculty ?? []} />

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Class</TableHead>
              <TableHead>Assigned Faculty</TableHead>
              <TableHead>Substitute</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="w-16 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subs?.map((sub) => {
              const assignment = Array.isArray(sub.teaching_assignments) ? sub.teaching_assignments[0] : sub.teaching_assignments;
              const originalFaculty = assignment ? (Array.isArray(assignment.profiles) ? assignment.profiles[0] : assignment.profiles) : undefined;
              const section = assignment ? (Array.isArray(assignment.sections) ? assignment.sections[0] : assignment.sections) : undefined;
              const dept = section ? (Array.isArray(section.departments) ? section.departments[0] : section.departments) : undefined;
              const subject = assignment ? (Array.isArray(assignment.subjects) ? assignment.subjects[0] : assignment.subjects) : undefined;
              const substitute = Array.isArray(sub.profiles) ? sub.profiles[0] : sub.profiles;

              return (
                <TableRow key={sub.id}>
                  <TableCell className="font-medium">{sub.session_date}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {dept?.code} {section?.year}-{section?.name} · {subject?.code}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{originalFaculty?.full_name}</TableCell>
                  <TableCell className="text-muted-foreground">{substitute?.full_name}</TableCell>
                  <TableCell className="text-muted-foreground">{sub.reason || "—"}</TableCell>
                  <TableCell className="text-right">
                    <ConfirmDeleteButton
                      id={sub.id}
                      description="Remove this substitution? The substitute will lose access to this class for that date."
                      action={deleteSubstitution}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
            {subs?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <UserCog2 className="size-6 text-muted-foreground/60" />
                    No substitutions arranged yet.
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
