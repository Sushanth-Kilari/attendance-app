"use client";

import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/csv-export";

export function ExportButtons({ filename, rows }: { filename: string; rows: Record<string, unknown>[] }) {
  return (
    <div className="flex gap-2 print:hidden">
      <Button variant="outline" size="sm" onClick={() => downloadCsv(filename, rows)}>
        <Download className="size-4" />
        Export CSV
      </Button>
      <Button variant="outline" size="sm" onClick={() => window.print()}>
        <Printer className="size-4" />
        Print / PDF
      </Button>
    </div>
  );
}
