import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { QueryError } from "@/components/query-error";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

function pctColor(pct: number | null) {
  if (pct === null) return "text-muted-foreground";
  if (pct < 75) return "text-red-600 dark:text-red-400";
  if (pct < 85) return "text-amber-600 dark:text-amber-400";
  return "text-green-600 dark:text-green-400";
}

function progressColor(pct: number | null) {
  if (pct === null) return "";
  if (pct < 75) return "[&>div]:bg-red-600";
  if (pct < 85) return "[&>div]:bg-amber-500";
  return "[&>div]:bg-green-600";
}

export default async function StudentOverviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: overall, error: overallError },
    { data: subjects, error: subjectsError },
  ] = await Promise.all([
    supabase.from("v_student_overall_attendance").select("*").eq("student_id", user!.id).maybeSingle(),
    supabase.from("v_student_subject_attendance").select("*").eq("student_id", user!.id).order("subject_code"),
  ]);

  const queryError = overallError ?? subjectsError;
  if (queryError) {
    return <QueryError message={queryError.message} />;
  }

  const overallPct = overall?.attendance_pct ?? null;

  return (
    <div className="flex flex-col gap-6">
      <Card className="shadow-sm">
        <CardHeader>
          <p className="text-sm text-muted-foreground">Overall attendance</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-baseline gap-3">
            <span className={`text-4xl font-semibold tracking-tight ${pctColor(overallPct)}`}>
              {overallPct !== null ? `${overallPct}%` : "—"}
            </span>
            {overall && (
              <span className="text-sm text-muted-foreground">
                {overall.attended_sessions} / {overall.total_sessions} sessions
              </span>
            )}
          </div>
          <Progress value={overallPct ?? 0} className={progressColor(overallPct)} />
          {overallPct !== null && overallPct < 75 && (
            <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
              <AlertTriangle className="size-4" />
              Below the 75% requirement.
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Subjects</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {subjects?.map((s) => (
            <Link key={s.subject_id} href={`/student/subjects/${s.subject_id}`}>
              <Card className="transition-all hover:border-primary/40 hover:shadow-md">
                <CardContent className="flex items-center justify-between gap-4 pt-6">
                  <div className="flex flex-col gap-1">
                    <p className="font-medium text-foreground">{s.subject_code}</p>
                    <p className="text-sm text-muted-foreground">{s.subject_name}</p>
                    <Progress
                      value={s.attendance_pct ?? 0}
                      className={`mt-1 h-1.5 w-32 ${progressColor(s.attendance_pct)}`}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p className={`text-lg font-semibold ${pctColor(s.attendance_pct)}`}>
                        {s.attendance_pct !== null ? `${s.attendance_pct}%` : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {s.attended_sessions}/{s.total_sessions}
                      </p>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground/50" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}

          {subjects?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No subjects yet — check back once your section has classes.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
