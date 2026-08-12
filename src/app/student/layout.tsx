import { ClipboardList } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { DashboardShell } from "@/components/dashboard-shell";
import type { NavItem } from "@/components/app-sidebar";

const navItems: NavItem[] = [{ title: "My Attendance", href: "/student", icon: <ClipboardList /> }];

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole("student");

  return (
    <DashboardShell navItems={navItems} groupLabel="Student" userName={profile.full_name} userRole="Student">
      {children}
    </DashboardShell>
  );
}
