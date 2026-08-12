"use client";

import Link from "next/link";
import { Loader2, Plus } from "lucide-react";
import { useToastAction } from "@/hooks/use-toast-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createNetworkRange, updateNetworkRange } from "./actions";

type NetworkRange = { id: string; label: string; cidr: string };

export function NetworkForm({ editing }: { editing?: NetworkRange }) {
  const action = editing ? updateNetworkRange : createNetworkRange;
  const [, formAction, pending] = useToastAction(action, editing ? "Range updated." : "Range added.");

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4 shadow-sm">
      {editing && <input type="hidden" name="id" value={editing.id} />}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="label">Label</Label>
        <Input id="label" name="label" defaultValue={editing?.label} required placeholder="Main Campus WiFi" className="w-56" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cidr">IP or CIDR range</Label>
        <Input id="cidr" name="cidr" defaultValue={editing?.cidr} required placeholder="203.0.113.0/24" className="w-48" />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : editing ? null : <Plus className="size-4" />}
        {pending ? "Saving..." : editing ? "Save" : "Add range"}
      </Button>

      {editing && (
        <Button variant="ghost" nativeButton={false} render={<Link href="/admin/network" />}>
          Cancel
        </Button>
      )}
    </form>
  );
}
