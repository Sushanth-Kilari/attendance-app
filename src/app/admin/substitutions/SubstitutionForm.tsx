"use client";

import { Loader2, Plus } from "lucide-react";
import { useToastAction } from "@/hooks/use-toast-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createSubstitution } from "./actions";

type Assignment = { id: string; label: string };
type Faculty = { id: string; full_name: string };

export function SubstitutionForm({ assignments, faculty }: { assignments: Assignment[]; faculty: Faculty[] }) {
  const [, formAction, pending] = useToastAction(createSubstitution, "Substitution arranged.");

  const assignmentLabels = new Map(assignments.map((a) => [a.id, a.label]));
  const facultyLabels = new Map(faculty.map((f) => [f.id, f.full_name]));

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="assignment_id">Class</Label>
        <Select name="assignment_id" required>
          <SelectTrigger id="assignment_id" className="w-64">
            <SelectValue placeholder="Select">{(value: string) => assignmentLabels.get(value) ?? "Select"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {assignments.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="session_date">Date</Label>
        <Input id="session_date" name="session_date" type="date" required className="w-40" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="substitute_faculty_id">Substitute</Label>
        <Select name="substitute_faculty_id" required>
          <SelectTrigger id="substitute_faculty_id" className="w-44">
            <SelectValue placeholder="Select">{(value: string) => facultyLabels.get(value) ?? "Select"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {faculty.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reason">Reason (optional)</Label>
        <Input id="reason" name="reason" placeholder="e.g. Sick leave" className="w-48" />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        {pending ? "Saving..." : "Add substitution"}
      </Button>
    </form>
  );
}
