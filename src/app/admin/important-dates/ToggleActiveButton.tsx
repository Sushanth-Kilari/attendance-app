"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { toggleImportantDateActive } from "./actions";

export function ToggleActiveButton({ id, isActive }: { id: string; isActive: boolean }) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await toggleImportantDateActive(id, !isActive);
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <button type="button" onClick={handleClick} disabled={pending} className="disabled:opacity-50">
      <Badge variant={isActive ? "default" : "outline"}>{isActive ? "Active" : "Inactive"}</Badge>
    </button>
  );
}
