"use client";

import Link from "next/link";
import { Loader2, Plus } from "lucide-react";
import { useToastAction } from "@/hooks/use-toast-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AREA_LABELS } from "@/lib/centres";
import { createCentre, updateCentre } from "./actions";

type Centre = { id: string; code: string; name: string; state: string; district: string; area_type: string };

export function CentreForm({ editing }: { editing?: Centre }) {
  const action = editing ? updateCentre : createCentre;
  const [, formAction, pending] = useToastAction(action, editing ? "Centre updated." : "Centre added.");

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4 shadow-sm">
      {editing && <input type="hidden" name="id" value={editing.id} />}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="code">Code</Label>
        <Input id="code" name="code" defaultValue={editing?.code} required placeholder="TC-HYD-014" className="w-36" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Centre name</Label>
        <Input id="name" name="name" defaultValue={editing?.name} required placeholder="Shakti Skill Centre" className="w-56" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="state">State</Label>
        <Input id="state" name="state" defaultValue={editing?.state} required placeholder="Telangana" className="w-36" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="district">District</Label>
        <Input id="district" name="district" defaultValue={editing?.district} required placeholder="Medak" className="w-36" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="area_type">Area</Label>
        <Select name="area_type" defaultValue={editing?.area_type ?? "rural"} required>
          <SelectTrigger id="area_type" className="w-32">
            <SelectValue>{(value: string) => AREA_LABELS[value] ?? value}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="rural">Rural</SelectItem>
            <SelectItem value="semi_urban">Semi-urban</SelectItem>
            <SelectItem value="urban">Urban</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : editing ? null : <Plus className="size-4" />}
        {pending ? "Saving..." : editing ? "Save" : "Add centre"}
      </Button>

      {editing && (
        <Button variant="ghost" nativeButton={false} render={<Link href="/admin/centres" />}>
          Cancel
        </Button>
      )}
    </form>
  );
}
