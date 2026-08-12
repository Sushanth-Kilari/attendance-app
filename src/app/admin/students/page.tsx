import { GraduationCap } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { QueryError } from "@/components/query-error";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ImportForm } from "./ImportForm";
import { toggleStudentActive } from "./actions";

export default async function StudentsPage() {
  const supabase = await createClient();

  const { data: students, error } = await supabase
    .from("students")
    .select(
      "user_id, roll_no, batch, phone_number, profiles(full_name, email, is_active), sections(name, year, academic_year, departments(code))",
    )
    .order("roll_no");

  if (error) {
    return <QueryError message={error.message} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Bulk import via CSV. Departments referenced by department_code must already exist; sections are created
        automatically if missing.
      </p>

      <ImportForm />

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Roll No</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Section</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-28 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students?.map((s) => {
              const profile = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
              const section = Array.isArray(s.sections) ? s.sections[0] : s.sections;
              const department = section
                ? Array.isArray(section.departments)
                  ? section.departments[0]
                  : section.departments
                : undefined;

              return (
                <TableRow key={s.user_id}>
                  <TableCell className="font-medium">{s.roll_no}</TableCell>
                  <TableCell className="text-muted-foreground">{profile?.full_name}</TableCell>
                  <TableCell className="text-muted-foreground">{profile?.email}</TableCell>
                  <TableCell className="text-muted-foreground">{s.phone_number ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {department?.code} {section?.year}-{section?.name} ({section?.academic_year})
                  </TableCell>
                  <TableCell className="text-muted-foreground">{s.batch}</TableCell>
                  <TableCell>
                    {profile?.is_active ? (
                      <Badge variant="outline" className="border-green-600/30 text-green-700 dark:text-green-400">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Inactive
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <form action={toggleStudentActive}>
                      <input type="hidden" name="user_id" value={s.user_id} />
                      <input type="hidden" name="next" value={(!profile?.is_active).toString()} />
                      <Button variant="ghost" size="sm" type="submit">
                        {profile?.is_active ? "Deactivate" : "Reactivate"}
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              );
            })}
            {students?.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <GraduationCap className="size-6 text-muted-foreground/60" />
                    No students yet — import a CSV above.
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
