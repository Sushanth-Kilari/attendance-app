import { GraduationCap } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { CheckinButton } from "./CheckinButton";

export default async function CheckinPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  await requireRole("student");
  const { sessionId } = await params;
  const { t: token } = await searchParams;

  const supabase = await createClient();
  const { data: session } = await supabase
    .from("class_sessions")
    .select("teaching_assignments(subjects(code, name), sections(name))")
    .eq("id", sessionId)
    .maybeSingle();

  const assignment = session ? (Array.isArray(session.teaching_assignments) ? session.teaching_assignments[0] : session.teaching_assignments) : undefined;
  const subject = assignment ? (Array.isArray(assignment.subjects) ? assignment.subjects[0] : assignment.subjects) : undefined;
  const subjectLabel = subject ? `${subject.code} — ${subject.name}` : "this class";

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-background p-6">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, color-mix(in oklch, var(--primary) 12%, transparent), transparent 55%), radial-gradient(circle at 85% 80%, color-mix(in oklch, var(--primary) 10%, transparent), transparent 50%)",
        }}
      />

      <Card className="relative w-full max-w-sm shadow-lg">
        <CardContent className="pt-6">
          {!token ? (
            <div className="flex flex-col items-center gap-3 text-center text-sm text-muted-foreground">
              <GraduationCap className="size-8 text-muted-foreground/60" />
              Missing check-in code. Scan the QR your faculty is showing, don&apos;t open this link directly.
            </div>
          ) : (
            <CheckinButton sessionId={sessionId} token={token} subjectLabel={subjectLabel} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
