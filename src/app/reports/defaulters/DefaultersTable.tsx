"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeRefetch } from "@/hooks/use-realtime-refetch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ExportButtons } from "../ExportButtons";

type DefaulterRow = {
  roll_no: string;
  student_name: string;
  department_code: string;
  year: number;
  section_name: string;
  subject_code: string;
  attendance_pct: number;
};

export function DefaultersTable({ initialRows }: { initialRows: DefaulterRow[] }) {
  const [rows, setRows] = useState(initialRows);

  const refetch = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("v_defaulters")
      .select("*")
      .order("department_code")
      .order("year")
      .order("section_name")
      .order("attendance_pct");
    if (data) setRows(data);
  }, []);

  useRealtimeRefetch("attendance_records", refetch);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          Students below 75% attendance in any subject.
          <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
            <span className="size-1.5 rounded-full bg-green-600 dark:bg-green-400" />
            Live
          </span>
        </p>
        <ExportButtons filename="defaulters.csv" rows={rows} />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Roll No</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Section</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Attendance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((d, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium">{d.roll_no}</TableCell>
                <TableCell className="text-muted-foreground">{d.student_name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {d.department_code} {d.year}-{d.section_name}
                </TableCell>
                <TableCell className="text-muted-foreground">{d.subject_code}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="border-red-600/30 text-red-700 dark:text-red-400">
                    {d.attendance_pct}%
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  No defaulters — everyone&apos;s above 75%.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
