"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, GraduationCap, Loader2, OctagonAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { selfCheckIn, type CheckinResult } from "./actions";

export function CheckinButton({ sessionId, token, subjectLabel }: { sessionId: string; token: string; subjectLabel: string }) {
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [pending, startTransition] = useTransition();

  function handleCheckin() {
    startTransition(async () => {
      setResult(await selfCheckIn(sessionId, token));
    });
  }

  if (result?.success) {
    return (
      <Alert>
        <CheckCircle2 className="size-4 text-green-600 dark:text-green-400" />
        <AlertDescription>
          {result.alreadyMarked
            ? `You're already marked for ${result.subjectCode ?? "this class"}.`
            : `You're checked in for ${result.subjectCode ?? "this class"}.`}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
        <GraduationCap className="size-7" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">Checking in for</p>
        <p className="text-lg font-semibold text-foreground">{subjectLabel}</p>
      </div>

      {result?.error && (
        <Alert variant="destructive">
          <OctagonAlert className="size-4" />
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      )}

      <Button onClick={handleCheckin} disabled={pending} className="w-full">
        {pending && <Loader2 className="size-4 animate-spin" />}
        {pending ? "Checking in..." : "Mark me present"}
      </Button>
    </div>
  );
}
