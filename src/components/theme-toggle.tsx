"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

const emptySubscribe = () => () => {};

// resolvedTheme is undefined on the server/first paint, so rendering an
// icon based on it before hydration would flash the wrong one.
// useSyncExternalStore's server/client snapshot split is the
// lint-clean way to detect "are we past hydration" — no setState in an
// effect (which triggers react-hooks' set-state-in-effect rule).
function useMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

export function ThemeToggleItem() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();

  if (!mounted) return <DropdownMenuItem disabled>Toggle theme</DropdownMenuItem>;

  const isDark = resolvedTheme === "dark";

  return (
    <DropdownMenuItem onClick={() => setTheme(isDark ? "light" : "dark")}>
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      {isDark ? "Light mode" : "Dark mode"}
    </DropdownMenuItem>
  );
}
