"use client";

import Link from "next/link";
import { Loader2, Plus } from "lucide-react";
import { useToastAction } from "@/hooks/use-toast-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createImportantDate, updateImportantDate } from "./actions";

type ImportantDate = {
  id: string;
  title: string;
  occasion_month: number;
  occasion_day: number;
  lead_days: number;
};

export function ImportantDateForm({ editing }: { editing?: ImportantDate }) {
  const action = editing ? updateImportantDate : createImportantDate;
  const [, formAction, pending] = useToastAction(action, editing ? "Important date updated." : "Important date added.");

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4 shadow-sm">
      {editing && <input type="hidden" name="id" value={editing.id} />}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          name="title"
          defaultValue={editing?.title}
          required
          placeholder="Independence Day"
          className="w-56"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="occasion_month">Month</Label>
        <Input
          id="occasion_month"
          name="occasion_month"
          type="number"
          min={1}
          max={12}
          defaultValue={editing?.occasion_month}
          required
          className="w-20"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="occasion_day">Day</Label>
        <Input
          id="occasion_day"
          name="occasion_day"
          type="number"
          min={1}
          max={31}
          defaultValue={editing?.occasion_day}
          required
          className="w-20"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lead_days">Lead days</Label>
        <Input
          id="lead_days"
          name="lead_days"
          type="number"
          min={0}
          defaultValue={editing?.lead_days ?? 3}
          required
          className="w-24"
        />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : editing ? null : <Plus className="size-4" />}
        {pending ? "Saving..." : editing ? "Save" : "Add date"}
      </Button>

      {editing && (
        <Button variant="ghost" nativeButton={false} render={<Link href="/admin/important-dates" />}>
          Cancel
        </Button>
      )}
    </form>
  );
}
