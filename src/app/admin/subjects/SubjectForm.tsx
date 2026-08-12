"use client";

import Link from "next/link";
import { Loader2, Plus } from "lucide-react";
import { useToastAction } from "@/hooks/use-toast-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createSubject, updateSubject } from "./actions";

type Department = { id: string; code: string };
type Subject = { id: string; department_id: string; code: string; name: string; semester: number };

export function SubjectForm({
  departments,
  editing,
}: {
  departments: Department[];
  editing?: Subject;
}) {
  const action = editing ? updateSubject : createSubject;
  const [, formAction, pending] = useToastAction(action, editing ? "Subject updated." : "Subject added.");
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
        <Label htmlFor="code">Code</Label>
        <Input id="code" name="code" defaultValue={editing?.code} required placeholder="CS301" className="w-28" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={editing?.name}
          required
          placeholder="Database Management Systems"
          className="w-72"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="semester">Semester</Label>
        <Input
          id="semester"
          type="number"
          name="semester"
          min={1}
          max={12}
          defaultValue={editing?.semester}
          required
          className="w-20"
        />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : editing ? null : <Plus className="size-4" />}
        {pending ? "Saving..." : editing ? "Save" : "Add subject"}
      </Button>

      {editing && (
        <Button variant="ghost" nativeButton={false} render={<Link href="/admin/subjects" />}>
          Cancel
        </Button>
      )}
    </form>
  );
}
