"use client";

import { useActionState } from "react";
import { Check, Copy, Loader2, OctagonAlert, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { addStaff } from "./actions";

type Department = { id: string; code: string };

const ROLE_LABELS: Record<string, string> = { faculty: "Faculty", hod: "HOD", admin: "Admin" };

export function StaffForm({ departments }: { departments: Department[] }) {
  const [state, formAction, pending] = useActionState(addStaff, undefined);
  const [copied, setCopied] = useState(false);
  const departmentLabels = new Map(departments.map((d) => [d.id, d.code]));

  function copyPassword(password: string) {
    navigator.clipboard.writeText(password);
    setCopied(true);
    toast.success("Password copied.");
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm">
      <form action={formAction} className="flex flex-wrap items-end gap-3" key={state?.success ? state.email : "form"}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="full_name">Full name</Label>
          <Input id="full_name" name="full_name" required placeholder="Dr. Priya Nair" className="w-56" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required placeholder="priya.nair@yourcollege.ac.in" className="w-64" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="role">Role</Label>
          <Select name="role" defaultValue="faculty" required>
            <SelectTrigger id="role" className="w-32">
              <SelectValue>{(value: string) => ROLE_LABELS[value] ?? value}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="faculty">Faculty</SelectItem>
              <SelectItem value="hod">HOD</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="department_id">Department</Label>
          <Select name="department_id">
            <SelectTrigger id="department_id" className="w-32">
              <SelectValue placeholder="None">{(value: string) => departmentLabels.get(value) ?? "None"}</SelectValue>
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

        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
          {pending ? "Adding..." : "Add staff"}
        </Button>
      </form>

      {state?.error && (
        <Alert variant="destructive">
          <OctagonAlert className="size-4" />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      {state?.success && (
        <Alert>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span>
              Account created for <span className="font-medium text-foreground">{state.email}</span>. Temporary
              password:
            </span>
            <code className="rounded bg-muted px-2 py-0.5 font-mono text-foreground">{state.tempPassword}</code>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={() => copyPassword(state.tempPassword)}
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </Button>
            <span className="text-muted-foreground">Shown once — copy it before leaving this page.</span>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
