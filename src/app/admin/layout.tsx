import { BarChart3, Building2, BookOpen, CalendarClock, CalendarDays, GraduationCap, LayoutDashboard, Sparkles, UserCog, UserCog2, Users, Wifi } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { DashboardShell } from "@/components/dashboard-shell";
import type { NavItem } from "@/components/app-sidebar";

const navItems: NavItem[] = [
  { title: "Overview", href: "/admin", icon: <LayoutDashboard /> },
  { title: "Departments", href: "/admin/departments", icon: <Building2 /> },
  { title: "Sections", href: "/admin/sections", icon: <Users /> },
  { title: "Subjects", href: "/admin/subjects", icon: <BookOpen /> },
  { title: "Students", href: "/admin/students", icon: <GraduationCap /> },
  { title: "Staff", href: "/admin/staff", icon: <UserCog /> },
  { title: "Timetable", href: "/admin/timetable", icon: <CalendarClock /> },
  { title: "Substitutions", href: "/admin/substitutions", icon: <UserCog2 /> },
  { title: "Important Dates", href: "/admin/important-dates", icon: <CalendarDays /> },
  { title: "Network", href: "/admin/network", icon: <Wifi /> },
  { title: "Reports", href: "/reports", icon: <BarChart3 /> },
  { title: "Ask AI", href: "/ai-query", icon: <Sparkles /> },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole("admin");

  return (
    <DashboardShell navItems={navItems} groupLabel="Admin" userName={profile.full_name} userRole="Admin">
      {children}
    </DashboardShell>
  );
}
