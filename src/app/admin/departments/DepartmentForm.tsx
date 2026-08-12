"use client";

import Link from "next/link";
import { Loader2, Plus } from "lucide-react";
import { useToastAction } from "@/hooks/use-toast-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createDepartment, updateDepartment } from "./actions";

type Department = { id: string; code: string; name: string };

export function DepartmentForm({ editing }: { editing?: Department }) {
  const action = editing ? updateDepartment : createDepartment;
  const [, formAction, pending] = useToastAction(action, editing ? "Department updated." : "Department added.");

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4 shadow-sm">
      {editing && <input type="hidden" name="id" value={editing.id} />}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="code">Code</Label>
        <Input id="code" name="code" defaultValue={editing?.code} required placeholder="CSE" className="w-32" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={editing?.name}
          required
          placeholder="Computer Science and Engineering"
          className="w-72"
        />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : editing ? null : <Plus className="size-4" />}
        {pending ? "Saving..." : editing ? "Save" : "Add department"}
      </Button>

      {editing && (
        <Button variant="ghost" nativeButton={false} render={<Link href="/admin/departments" />}>
          Cancel
        </Button>
      )}
    </form>
  );
}
