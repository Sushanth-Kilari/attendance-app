"use client";

import { usePathname } from "next/navigation";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AppSidebar, type NavItem } from "@/components/app-sidebar";

export function DashboardShell({
  navItems,
  groupLabel,
  userName,
  userRole,
  children,
}: {
  navItems: NavItem[];
  groupLabel: string;
  userName: string;
  userRole: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active =
    navItems.find((n) => n.href === pathname) ??
    [...navItems].reverse().find((n) => n.href !== "/" && pathname.startsWith(n.href));

  return (
    <SidebarProvider>
      <AppSidebar navItems={navItems} groupLabel={groupLabel} userName={userName} userRole={userRole} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 print:hidden">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <h1 className="text-sm font-medium text-foreground">{active?.title ?? groupLabel}</h1>
        </header>
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
