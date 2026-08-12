"use client";

import { useActionState } from "react";
import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { startSession } from "./actions";

export function StartSessionForm({
  assignmentId,
  sessionDate,
  takenPeriods,
}: {
  assignmentId: string;
  sessionDate: string;
  takenPeriods: number[];
}) {
  const [state, formAction, pending] = useActionState(startSession, undefined);
  const periods = Array.from({ length: 10 }, (_, i) => i + 1);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="assignment_id" value={assignmentId} />
      <input type="hidden" name="session_date" value={sessionDate} />

      <Select name="period_no" required>
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Period">
            {(value: string) => (value ? `Period ${value}${takenPeriods.includes(Number(value)) ? " (started)" : ""}` : "Period")}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {periods.map((p) => (
            <SelectItem key={p} value={String(p)}>
              Period {p}
              {takenPeriods.includes(p) ? " (started)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button type="submit" disabled={pending} size="sm">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
        {pending ? "Starting..." : "Start"}
      </Button>

      {state?.error && <span className="text-sm text-destructive">{state.error}</span>}
    </form>
  );
}
