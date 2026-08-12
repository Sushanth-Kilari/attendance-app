"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeRefetch } from "@/hooks/use-realtime-refetch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ExportButtons } from "./ExportButtons";

type SummaryRow = {
  department_code: string;
  year: number;
  section_name: string;
  subject_code: string;
  subject_name: string;
  students: number;
  avg_attendance_pct: number | null;
  defaulter_count: number;
};

function pctColor(pct: number | null) {
  if (pct === null) return "text-muted-foreground";
  if (pct < 75) return "text-red-600 dark:text-red-400";
  if (pct < 85) return "text-amber-600 dark:text-amber-400";
  return "text-green-600 dark:text-green-400";
}

export function SectionSummaryTable({ initialRows }: { initialRows: SummaryRow[] }) {
  const [rows, setRows] = useState(initialRows);

  const refetch = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("v_section_summary")
      .select("*")
      .order("department_code")
      .order("year")
      .order("section_name")
      .order("subject_code");
    if (data) setRows(data);
  }, []);

  useRealtimeRefetch("attendance_records", refetch);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          Average attendance per section/subject, across the whole university.
          <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
            <span className="size-1.5 rounded-full bg-green-600 dark:bg-green-400" />
            Live
          </span>
        </p>
        <ExportButtons filename="section-summary.csv" rows={rows} />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Department</TableHead>
              <TableHead>Section</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Students</TableHead>
              <TableHead>Avg %</TableHead>
              <TableHead>Defaulters</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium">{row.department_code}</TableCell>
                <TableCell className="text-muted-foreground">
                  {row.year}-{row.section_name}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {row.subject_code} — {row.subject_name}
                </TableCell>
                <TableCell>{row.students}</TableCell>
                <TableCell className={pctColor(row.avg_attendance_pct)}>{row.avg_attendance_pct}%</TableCell>
                <TableCell>
                  {row.defaulter_count > 0 ? (
                    <Badge variant="outline" className="border-red-600/30 text-red-700 dark:text-red-400">
                      {row.defaulter_count}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  No data yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
