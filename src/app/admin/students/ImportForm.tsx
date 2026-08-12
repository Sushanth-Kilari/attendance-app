"use client";

import { useActionState } from "react";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { importStudents } from "./actions";

export function ImportForm() {
  const [state, formAction, pending] = useActionState(importStudents, undefined);

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm">
      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="file"
          accept=".csv"
          required
          className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground hover:file:bg-secondary/80"
        />
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {pending ? "Importing..." : "Import CSV"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Columns: roll_no, full_name, email, department_code, year, section_name, academic_year, batch, phone
          (optional — enables WhatsApp delivery for circulars)
        </span>
      </form>

      {state?.results && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="outline" className="border-green-600/30 text-green-700 dark:text-green-400">
              {state.results.filter((r) => r.status === "created").length} created
            </Badge>
            <Badge variant="outline" className="border-amber-600/30 text-amber-700 dark:text-amber-400">
              {state.results.filter((r) => r.status === "skipped").length} skipped
            </Badge>
            <Badge variant="outline" className="border-red-600/30 text-red-700 dark:text-red-400">
              {state.results.filter((r) => r.status === "failed").length} failed
            </Badge>
          </div>

          <div className="max-h-80 overflow-auto rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 bg-muted/60 backdrop-blur">
                <TableRow>
                  <TableHead>Roll No</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Detail</TableHead>
                  <TableHead>Temp password</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.results.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{r.roll_no}</TableCell>
                    <TableCell>{r.email}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          r.status === "created"
                            ? "border-green-600/30 text-green-700 dark:text-green-400"
                            : r.status === "skipped"
                              ? "border-amber-600/30 text-amber-700 dark:text-amber-400"
                              : "border-red-600/30 text-red-700 dark:text-red-400"
                        }
                      >
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.detail}</TableCell>
                    <TableCell className="font-mono">{r.temp_password ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <p className="text-xs text-muted-foreground">
            Temporary passwords are shown once — copy them out before leaving this page. There is no
            password-reset flow yet, so distribute these directly to students.
          </p>
        </div>
      )}
    </div>
  );
}
