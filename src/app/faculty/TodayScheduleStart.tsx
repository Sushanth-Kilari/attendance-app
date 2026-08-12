"use client";

import { useActionState } from "react";
import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startSession } from "./actions";

// One-click version of StartSessionForm for a timetabled slot — the period
// is already known, so there's no picker, just a Start button.
export function TodayScheduleStart({ assignmentId, sessionDate, periodNo }: { assignmentId: string; sessionDate: string; periodNo: number }) {
  const [state, formAction, pending] = useActionState(startSession, undefined);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="assignment_id" value={assignmentId} />
      <input type="hidden" name="session_date" value={sessionDate} />
      <input type="hidden" name="period_no" value={periodNo} />
      <Button type="submit" disabled={pending} size="sm">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
        {pending ? "Starting..." : "Start"}
      </Button>
      {state?.error && <span className="text-sm text-destructive">{state.error}</span>}
    </form>
  );
}
