import { redirect } from "next/navigation";
import { GraduationCap, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/actions/auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const ROLE_LABEL: Record<string, string> = {
  student: "Student",
  faculty: "Faculty",
  hod: "HOD",
  admin: "Admin",
  monitor: "Monitor",
};

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware already guards this route, but a page-level check keeps the
  // component correct if it's ever rendered outside the middleware matcher.
  if (!user) {
    redirect("/login");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("full_name, role, email, departments(name, code)")
    .eq("id", user.id)
    .single();

  if (profile?.role === "admin") {
    redirect("/admin");
  }

  if (profile?.role === "faculty") {
    redirect("/faculty");
  }

  if (profile?.role === "student") {
    redirect("/student");
  }

  if (profile?.role === "hod") {
    redirect("/reports");
  }

  if (profile?.role === "monitor") {
    redirect("/monitor");
  }

  if (error || !profile) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background p-6">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-4 pt-6 text-center">
            <p className="text-sm text-muted-foreground">
              Signed in, but no profile row was found for this account. Ask an admin to create one.
            </p>
            <form action={signOut}>
              <Button type="submit" variant="link" size="sm">
                Sign out
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  const department = Array.isArray(profile.departments) ? profile.departments[0] : profile.departments;

  return (
    <div className="flex flex-1 items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <GraduationCap className="size-6" />
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Welcome, {profile.full_name}</h1>
            <Badge variant="secondary">
              {ROLE_LABEL[profile.role] ?? profile.role}
              {department ? ` · ${department.code}` : ""}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6">
          <div className="flex w-full items-start gap-3 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>Nothing to show for this role yet.</span>
          </div>

          <form action={signOut}>
            <Button type="submit" variant="link" size="sm" className="text-muted-foreground">
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
