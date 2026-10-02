import { LayoutDashboard } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { DashboardShell } from "@/components/dashboard-shell";
import type { NavItem } from "@/components/app-sidebar";

const navItems: NavItem[] = [{ title: "Centres", href: "/monitor", icon: <LayoutDashboard /> }];

export default async function MonitorLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole("monitor", "admin");

  return (
    <DashboardShell navItems={navItems} groupLabel="Monitoring" userName={profile.full_name} userRole="Monitor">
      {children}
    </DashboardShell>
  );
}
