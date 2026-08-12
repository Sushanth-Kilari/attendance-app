import Link from "next/link";
import { ArrowRight, BookOpen, Building2, GraduationCap, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { QueryError } from "@/components/query-error";

export default async function AdminOverviewPage() {
  const supabase = await createClient();

  const [
    { count: departments, error: departmentsError },
    { count: sections, error: sectionsError },
    { count: subjects, error: subjectsError },
    { count: students, error: studentsError },
  ] = await Promise.all([
    supabase.from("departments").select("*", { count: "exact", head: true }),
    supabase.from("sections").select("*", { count: "exact", head: true }),
    supabase.from("subjects").select("*", { count: "exact", head: true }),
    supabase.from("students").select("*", { count: "exact", head: true }),
  ]);

  const queryError = departmentsError ?? sectionsError ?? subjectsError ?? studentsError;
  if (queryError) {
    return <QueryError message={queryError.message} />;
  }

  const cards = [
    { label: "Departments", count: departments ?? 0, href: "/admin/departments", icon: Building2 },
    { label: "Sections", count: sections ?? 0, href: "/admin/sections", icon: Users },
    { label: "Subjects", count: subjects ?? 0, href: "/admin/subjects", icon: BookOpen },
    { label: "Students", count: students ?? 0, href: "/admin/students", icon: GraduationCap },
  ];

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Set up departments first, then sections and subjects, then import students by CSV.
      </p>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="group">
            <Card className="transition-all group-hover:border-primary/40 group-hover:shadow-md">
              <CardHeader className="flex-row items-center justify-between pb-2">
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <c.icon className="size-4.5" />
                </div>
                <ArrowRight className="size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </CardHeader>
              <CardContent className="flex flex-col gap-0.5">
                <span className="text-3xl font-semibold tracking-tight text-foreground">{c.count}</span>
                <span className="text-sm text-muted-foreground">{c.label}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
