import { CalendarDays } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { QueryError } from "@/components/query-error";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ImportantDateForm } from "./ImportantDateForm";
import { ToggleActiveButton } from "./ToggleActiveButton";
import { deleteImportantDate } from "./actions";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export default async function ImportantDatesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const { edit } = await searchParams;
  const supabase = await createClient();
  const { data: importantDates, error } = await supabase
    .from("important_dates")
    .select("*")
    .order("occasion_month")
    .order("occasion_day");

  if (error) {
    return <QueryError message={error.message} />;
  }

  const editing = edit ? importantDates?.find((d) => d.id === edit) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Every year, {"“lead days”"} before each active date, a circular is auto-drafted for every
        department and put in that department{"’"}s HOD approval queue at{" "}
        <span className="font-medium text-foreground">Reports &rarr; Circulars</span>.
      </p>

      <ImportantDateForm key={editing?.id ?? "new"} editing={editing} />

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Lead days</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-40 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {importantDates?.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.title}</TableCell>
                <TableCell className="text-muted-foreground">
                  {MONTH_NAMES[d.occasion_month - 1]} {d.occasion_day}
                </TableCell>
                <TableCell className="text-muted-foreground">{d.lead_days}</TableCell>
                <TableCell>
                  <ToggleActiveButton id={d.id} isActive={d.is_active} />
                </TableCell>

                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    nativeButton={false}
                    render={<Link href={`/admin/important-dates?edit=${d.id}`} />}
                  >
                    Edit
                  </Button>
                  <ConfirmDeleteButton
                    id={d.id}
                    description={`Delete "${d.title}"? Any circulars already drafted from it are kept.`}
                    action={deleteImportantDate}
                  />
                </TableCell>
              </TableRow>
            ))}
            {importantDates?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <CalendarDays className="size-6 text-muted-foreground/60" />
                    No important dates yet.
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
