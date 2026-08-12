import { CalendarCheck, Sparkles } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { DashboardShell } from "@/components/dashboard-shell";
import type { NavItem } from "@/components/app-sidebar";

const navItems: NavItem[] = [
  { title: "My Classes", href: "/faculty", icon: <CalendarCheck /> },
  { title: "Ask AI", href: "/ai-query", icon: <Sparkles /> },
];

export default async function FacultyLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole("faculty");

  return (
    <DashboardShell navItems={navItems} groupLabel="Faculty" userName={profile.full_name} userRole="Faculty">
      {children}
    </DashboardShell>
  );
}
