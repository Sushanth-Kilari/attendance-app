import Link from "next/link";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { QueryError } from "@/components/query-error";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { SectionForm } from "./SectionForm";
import { deleteSection } from "./actions";

export default async function SectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const { edit } = await searchParams;
  const supabase = await createClient();

  const [
    { data: departments, error: departmentsError },
    { data: sections, error: sectionsError },
    { data: centres, error: centresError },
  ] = await Promise.all([
    supabase.from("departments").select("id, code").order("code"),
    supabase
      .from("sections")
      .select("id, department_id, year, name, academic_year, centre_id, departments(code), centres(code)")
      .order("academic_year", { ascending: false }),
    supabase.from("centres").select("id, code").order("code"),
  ]);

  const queryError = departmentsError ?? sectionsError ?? centresError;
  if (queryError) {
    return <QueryError message={queryError.message} />;
  }

  const editing = edit ? sections?.find((s) => s.id === edit) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">A class group (batch): department, year, section, academic year, and the training centre it runs at.</p>

      {(departments?.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">Create a department first.</p>
      ) : (
        <SectionForm key={editing?.id ?? "new"} departments={departments ?? []} centres={centres ?? []} editing={editing} />
      )}

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Department</TableHead>
              <TableHead>Year</TableHead>
              <TableHead>Section</TableHead>
              <TableHead>Academic year</TableHead>
              <TableHead>Centre</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sections?.map((s) => {
              const department = Array.isArray(s.departments) ? s.departments[0] : s.departments;
              const centre = Array.isArray(s.centres) ? s.centres[0] : s.centres;
              return (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{department?.code}</TableCell>
                  <TableCell className="text-muted-foreground">{s.year}</TableCell>
                  <TableCell className="text-muted-foreground">{s.name}</TableCell>
                  <TableCell className="text-muted-foreground">{s.academic_year}</TableCell>
                  <TableCell className="text-muted-foreground">{centre?.code ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      nativeButton={false}
                      render={<Link href={`/admin/sections?edit=${s.id}`} />}
                    >
                      Edit
                    </Button>
                    <ConfirmDeleteButton
                      id={s.id}
                      description="Delete this section? This fails if students are still assigned to it."
                      action={deleteSection}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
            {sections?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <Users className="size-6 text-muted-foreground/60" />
                    No sections yet.
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
