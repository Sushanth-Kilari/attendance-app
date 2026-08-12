import { AlertTriangle, CalendarX, LayoutDashboard, Megaphone, Sparkles } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { DashboardShell } from "@/components/dashboard-shell";
import type { NavItem } from "@/components/app-sidebar";

const navItems: NavItem[] = [
  { title: "Section Summary", href: "/reports", icon: <LayoutDashboard /> },
  { title: "Defaulters", href: "/reports/defaulters", icon: <AlertTriangle /> },
  { title: "Missed Classes", href: "/reports/missed-classes", icon: <CalendarX /> },
  { title: "Circulars", href: "/reports/circulars", icon: <Megaphone /> },
  { title: "Ask AI", href: "/ai-query", icon: <Sparkles /> },
];

export default async function ReportsLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole("hod", "admin");

  return (
    <DashboardShell navItems={navItems} groupLabel="Reports" userName={profile.full_name} userRole={profile.role}>
      {children}
    </DashboardShell>
  );
}
