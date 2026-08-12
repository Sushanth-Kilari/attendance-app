import { Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { QueryError } from "@/components/query-error";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { DepartmentForm } from "./DepartmentForm";
import { deleteDepartment } from "./actions";

export default async function DepartmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const { edit } = await searchParams;
  const supabase = await createClient();
  const { data: departments, error } = await supabase.from("departments").select("*").order("code");

  if (error) {
    return <QueryError message={error.message} />;
  }

  const editing = edit ? departments?.find((d) => d.id === edit) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Code must be unique (e.g. CSE, ECE) — sections, subjects, and CSV imports reference it.
      </p>

      <DepartmentForm key={editing?.id ?? "new"} editing={editing} />

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {departments?.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.code}</TableCell>
                <TableCell className="text-muted-foreground">{d.name}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    nativeButton={false}
                    render={<Link href={`/admin/departments?edit=${d.id}`} />}
                  >
                    Edit
                  </Button>
                  <ConfirmDeleteButton
                    id={d.id}
                    description={`Delete department "${d.code}"? This fails if sections or subjects still reference it.`}
                    action={deleteDepartment}
                  />
                </TableCell>
              </TableRow>
            ))}
            {departments?.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="h-32 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <Building2 className="size-6 text-muted-foreground/60" />
                    No departments yet.
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
