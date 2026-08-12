import Link from "next/link";
import { BookOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { QueryError } from "@/components/query-error";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { SubjectForm } from "./SubjectForm";
import { deleteSubject } from "./actions";

export default async function SubjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const { edit } = await searchParams;
  const supabase = await createClient();

  const [
    { data: departments, error: departmentsError },
    { data: subjects, error: subjectsError },
  ] = await Promise.all([
    supabase.from("departments").select("id, code").order("code"),
    supabase
      .from("subjects")
      .select("id, department_id, code, name, semester, departments(code)")
      .order("code"),
  ]);

  const queryError = departmentsError ?? subjectsError;
  if (queryError) {
    return <QueryError message={queryError.message} />;
  }

  const editing = edit ? subjects?.find((s) => s.id === edit) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">Code must be unique within a department (e.g. CSE / CS301).</p>

      {(departments?.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">Create a department first.</p>
      ) : (
        <SubjectForm key={editing?.id ?? "new"} departments={departments ?? []} editing={editing} />
      )}

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Department</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Semester</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subjects?.map((s) => {
              const department = Array.isArray(s.departments) ? s.departments[0] : s.departments;
              return (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{department?.code}</TableCell>
                  <TableCell className="text-muted-foreground">{s.code}</TableCell>
                  <TableCell className="text-muted-foreground">{s.name}</TableCell>
                  <TableCell className="text-muted-foreground">{s.semester}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      nativeButton={false}
                      render={<Link href={`/admin/subjects?edit=${s.id}`} />}
                    >
                      Edit
                    </Button>
                    <ConfirmDeleteButton
                      id={s.id}
                      description={`Delete subject "${s.code}"? This fails if teaching assignments still reference it.`}
                      action={deleteSubject}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
            {subjects?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <BookOpen className="size-6 text-muted-foreground/60" />
                    No subjects yet.
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
