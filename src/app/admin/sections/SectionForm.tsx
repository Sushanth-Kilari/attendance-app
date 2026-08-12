"use client";

import Link from "next/link";
import { Loader2, Plus } from "lucide-react";
import { useToastAction } from "@/hooks/use-toast-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createSection, updateSection } from "./actions";

type Department = { id: string; code: string };
type Section = { id: string; department_id: string; year: number; name: string; academic_year: string };

export function SectionForm({
  departments,
  editing,
}: {
  departments: Department[];
  editing?: Section;
}) {
  const action = editing ? updateSection : createSection;
  const [, formAction, pending] = useToastAction(action, editing ? "Section updated." : "Section added.");
  const departmentLabels = new Map(departments.map((d) => [d.id, d.code]));

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4 shadow-sm">
      {editing && <input type="hidden" name="id" value={editing.id} />}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="department_id">Department</Label>
        <Select name="department_id" defaultValue={editing?.department_id} required>
          <SelectTrigger id="department_id" className="w-32">
            <SelectValue placeholder="Select">{(value: string) => departmentLabels.get(value) ?? "Select"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="year">Year</Label>
        <Input id="year" type="number" name="year" min={1} max={6} defaultValue={editing?.year} required className="w-20" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Section</Label>
        <Input id="name" name="name" defaultValue={editing?.name} required placeholder="A" className="w-20" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="academic_year">Academic year</Label>
        <Input
          id="academic_year"
          name="academic_year"
          defaultValue={editing?.academic_year}
          required
          placeholder="2026-27"
          className="w-28"
        />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : editing ? null : <Plus className="size-4" />}
        {pending ? "Saving..." : editing ? "Save" : "Add section"}
      </Button>

      {editing && (
        <Button variant="ghost" nativeButton={false} render={<Link href="/admin/sections" />}>
          Cancel
        </Button>
      )}
    </form>
  );
}
