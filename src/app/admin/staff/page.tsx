import { UserCog } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { QueryError } from "@/components/query-error";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StaffForm } from "./StaffForm";
import { toggleStaffActive } from "./actions";

const ROLE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  admin: "default",
  hod: "secondary",
  faculty: "outline",
};

export default async function StaffPage() {
  const supabase = await createClient();

  const [
    { data: departments, error: departmentsError },
    { data: staff, error: staffError },
  ] = await Promise.all([
    supabase.from("departments").select("id, code").order("code"),
    supabase
      .from("profiles")
      .select("id, full_name, email, role, is_active, departments(code)")
      .in("role", ["faculty", "hod", "admin", "monitor"])
      .order("full_name"),
  ]);

  const queryError = departmentsError ?? staffError;
  if (queryError) {
    return <QueryError message={queryError.message} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Faculty, HOD, and admin accounts. Each gets a temporary password shown once — distribute it directly.
      </p>

      <StaffForm departments={departments ?? []} />

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff?.map((s) => {
              const department = Array.isArray(s.departments) ? s.departments[0] : s.departments;
              return (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.full_name}</TableCell>
                  <TableCell className="text-muted-foreground">{s.email}</TableCell>
                  <TableCell>
                    <Badge variant={ROLE_VARIANT[s.role] ?? "outline"} className="capitalize">
                      {s.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{department?.code ?? "—"}</TableCell>
                  <TableCell>
                    {s.is_active ? (
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
                    <form action={toggleStaffActive} className="inline">
                      <input type="hidden" name="user_id" value={s.id} />
                      <input type="hidden" name="next" value={(!s.is_active).toString()} />
                      <Button variant="ghost" size="sm" type="submit">
                        {s.is_active ? "Deactivate" : "Reactivate"}
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              );
            })}
            {staff?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <UserCog className="size-6 text-muted-foreground/60" />
                    No staff accounts yet.
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
