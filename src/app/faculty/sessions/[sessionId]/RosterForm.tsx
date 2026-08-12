"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { Briefcase, Check, Clock, Loader2, QrCode, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeRefetch } from "@/hooks/use-realtime-refetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { submitAttendance } from "./actions";
import { CheckinQrPanel } from "./CheckinQrPanel";
import type { AttendanceStatus } from "@/lib/types";

type Student = { user_id: string; roll_no: string; full_name: string };

const STATUSES: { value: AttendanceStatus; label: string; icon: typeof Check }[] = [
  { value: "present", label: "P", icon: Check },
  { value: "absent", label: "A", icon: X },
  { value: "late", label: "L", icon: Clock },
  { value: "on_duty", label: "OD", icon: Briefcase },
];

const ACTIVE_STYLES: Record<AttendanceStatus, string> = {
  present: "bg-green-600 text-white hover:bg-green-600",
  absent: "bg-red-600 text-white hover:bg-red-600",
  late: "bg-amber-500 text-white hover:bg-amber-500",
  on_duty: "bg-blue-600 text-white hover:bg-blue-600",
};

function initialsOf(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function RosterForm({
  sessionId,
  students,
  existingStatuses,
  checkedInViaQr,
  alreadySubmitted,
  initialTopic = "",
}: {
  sessionId: string;
  students: Student[];
  existingStatuses: Record<string, AttendanceStatus>;
  checkedInViaQr: Record<string, boolean>;
  alreadySubmitted: boolean;
  initialTopic?: string;
}) {
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>(() => {
    const initial: Record<string, AttendanceStatus> = {};
    for (const s of students) {
      initial[s.user_id] = existingStatuses[s.user_id] ?? "present";
    }
    return initial;
  });
  const [checkedIn, setCheckedIn] = useState<Record<string, boolean>>(checkedInViaQr);
  const [topic, setTopic] = useState(initialTopic);
  const [isPending, startTransition] = useTransition();
  // Students the faculty has manually tapped — a live self-check-in
  // arriving afterward updates the "scanned" badge but never overwrites a
  // status the faculty already set by hand.
  const touchedRef = useRef<Set<string>>(new Set());

  const refetchCheckedIn = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from("attendance_records").select("student_id, marked_by").eq("session_id", sessionId);
    if (!data) return;

    setCheckedIn((prev) => {
      const next = { ...prev };
      for (const r of data) {
        if (r.marked_by === r.student_id) next[r.student_id] = true;
      }
      return next;
    });

    setStatuses((prev) => {
      const next = { ...prev };
      for (const r of data) {
        if (r.marked_by === r.student_id && !touchedRef.current.has(r.student_id)) {
          next[r.student_id] = "present";
        }
      }
      return next;
    });
  }, [sessionId]);

  useRealtimeRefetch("attendance_records", refetchCheckedIn);

  const checkedInCount = Object.values(checkedIn).filter(Boolean).length;

  const counts = useMemo(
    () =>
      students.reduce(
        (acc, s) => {
          const status = statuses[s.user_id];
          acc[status] = (acc[status] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    [students, statuses],
  );

  function handleSubmit() {
    startTransition(async () => {
      const records = students.map((s) => ({ student_id: s.user_id, status: statuses[s.user_id] }));
      const res = await submitAttendance(sessionId, records, topic);
      if (res.error) toast.error(res.error);
      else toast.success("Attendance saved.");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <CheckinQrPanel sessionId={sessionId} />

      <div className="sticky top-0 z-10 flex flex-col gap-3 rounded-xl border bg-card/95 p-4 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="topic" className="text-xs text-muted-foreground">
            Topic covered (optional)
          </Label>
          <Input
            id="topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Normalization — 3NF"
            className="max-w-md"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-sm">
          {checkedInCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
              <QrCode className="size-3.5" />
              {checkedInCount} scanned in
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-600/10 px-2.5 py-1 font-medium text-green-700 dark:text-green-400">
            {counts.present ?? 0} present
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600/10 px-2.5 py-1 font-medium text-red-700 dark:text-red-400">
            {counts.absent ?? 0} absent
          </span>
          {(counts.late ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 font-medium text-amber-700 dark:text-amber-400">
              {counts.late} late
            </span>
          )}
          {(counts.on_duty ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-600/10 px-2.5 py-1 font-medium text-blue-700 dark:text-blue-400">
              {counts.on_duty} OD
            </span>
          )}
        </div>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending && <Loader2 className="size-4 animate-spin" />}
            {isPending ? "Submitting..." : alreadySubmitted ? "Save corrections" : "Submit attendance"}
          </Button>
        </div>
      </div>

      <div className="flex flex-col divide-y rounded-xl border bg-card shadow-sm">
        {students.map((s) => (
          <div key={s.user_id} className="flex items-center justify-between gap-4 px-4 py-2.5">
            <div className="flex items-center gap-3">
              <Avatar className="size-8">
                <AvatarFallback className="bg-muted text-xs text-muted-foreground">
                  {initialsOf(s.full_name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-foreground">{s.full_name}</p>
                  {checkedIn[s.user_id] && (
                    <Badge variant="outline" className="gap-1 border-primary/30 px-1.5 py-0 text-[10px] text-primary">
                      <QrCode className="size-2.5" />
                      Scanned
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{s.roll_no}</p>
              </div>
            </div>
            <div className="flex gap-1">
              {STATUSES.map((opt) => {
                const active = statuses[s.user_id] === opt.value;
                return (
                  <Button
                    key={opt.value}
                    type="button"
                    size="icon"
                    variant={active ? "default" : "secondary"}
                    className={`size-9 rounded-full ${active ? ACTIVE_STYLES[opt.value] : ""}`}
                    onClick={() => {
                      touchedRef.current.add(s.user_id);
                      setStatuses((prev) => ({ ...prev, [s.user_id]: opt.value }));
                    }}
                    title={opt.value}
                  >
                    <opt.icon className="size-4" />
                  </Button>
                );
              })}
            </div>
          </div>
        ))}

        {students.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">No students in this section yet.</p>
        )}
      </div>
    </div>
  );
}
