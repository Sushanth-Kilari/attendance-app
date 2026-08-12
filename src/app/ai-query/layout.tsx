import { Sparkles } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { DashboardShell } from "@/components/dashboard-shell";
import type { NavItem } from "@/components/app-sidebar";

const navItems: NavItem[] = [{ title: "Ask AI", href: "/ai-query", icon: <Sparkles /> }];

export default async function AiQueryLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole("faculty", "hod", "admin");

  return (
    <DashboardShell navItems={navItems} groupLabel="Ask AI" userName={profile.full_name} userRole={profile.role}>
      {children}
    </DashboardShell>
  );
}
