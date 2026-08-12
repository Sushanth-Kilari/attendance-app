"use client";

import { Loader2, Plus } from "lucide-react";
import { useToastAction } from "@/hooks/use-toast-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createTimetableSlot } from "./actions";

const DAYS = [
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

const PERIODS = Array.from({ length: 10 }, (_, i) => i + 1);

type Faculty = { id: string; full_name: string };
type Section = { id: string; label: string };
type Subject = { id: string; label: string };

export function TimetableForm({
  faculty,
  sections,
  subjects,
}: {
  faculty: Faculty[];
  sections: Section[];
  subjects: Subject[];
}) {
  const [, formAction, pending] = useToastAction(createTimetableSlot, "Timetable slot added.");

  const facultyLabels = new Map(faculty.map((f) => [f.id, f.full_name]));
  const sectionLabels = new Map(sections.map((s) => [s.id, s.label]));
  const subjectLabels = new Map(subjects.map((s) => [s.id, s.label]));
  const dayLabels = new Map(DAYS.map((d) => [d.value, d.label]));

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="faculty_id">Faculty</Label>
        <Select name="faculty_id" required>
          <SelectTrigger id="faculty_id" className="w-44">
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
        <Label htmlFor="section_id">Section</Label>
        <Select name="section_id" required>
          <SelectTrigger id="section_id" className="w-44">
            <SelectValue placeholder="Select">{(value: string) => sectionLabels.get(value) ?? "Select"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {sections.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="subject_id">Subject</Label>
        <Select name="subject_id" required>
          <SelectTrigger id="subject_id" className="w-48">
            <SelectValue placeholder="Select">{(value: string) => subjectLabels.get(value) ?? "Select"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {subjects.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="semester">Semester</Label>
        <Input id="semester" name="semester" placeholder="ODD-2026" required className="w-32" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="day_of_week">Day</Label>
        <Select name="day_of_week" required>
          <SelectTrigger id="day_of_week" className="w-36">
            <SelectValue placeholder="Select">{(value: string) => dayLabels.get(value) ?? "Select"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {DAYS.map((d) => (
              <SelectItem key={d.value} value={d.value}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="period_no">Period</Label>
        <Select name="period_no" required>
          <SelectTrigger id="period_no" className="w-28">
            <SelectValue placeholder="Select">{(value: string) => (value ? `Period ${value}` : "Select")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => (
              <SelectItem key={p} value={String(p)}>
                Period {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        {pending ? "Adding..." : "Add slot"}
      </Button>
    </form>
  );
}
