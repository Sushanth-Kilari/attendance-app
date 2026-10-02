"use client";

import { useActionState, useState } from "react";
import { Check, Copy, KeyRound, Loader2, OctagonAlert, Plus } from "lucide-react";
import { toast } from "sonner";
import { useToastAction } from "@/hooks/use-toast-action";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createCamera, rotateIngestKey } from "./actions";

type Section = { id: string; label: string };

export function CameraForm({ centreId, sections }: { centreId: string; sections: Section[] }) {
  const [, formAction, pending] = useToastAction(createCamera, "Camera added.");
  const sectionLabels = new Map(sections.map((s) => [s.id, s.label]));

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <input type="hidden" name="centre_id" value={centreId} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="label">Camera label</Label>
        <Input id="label" name="label" required placeholder="Lab-1 front" className="w-48" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="section_id">Batch in this room</Label>
        <Select name="section_id">
          <SelectTrigger id="section_id" className="w-56">
            <SelectValue placeholder="None (centre-level only)">
              {(value: string) => sectionLabels.get(value) ?? "None (centre-level only)"}
            </SelectValue>
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

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        {pending ? "Adding..." : "Add camera"}
      </Button>
    </form>
  );
}

export function IngestKeyPanel({ centreId, centreCode }: { centreId: string; centreCode: string }) {
  const [state, formAction, pending] = useActionState(rotateIngestKey, undefined);
  const [copied, setCopied] = useState(false);

  function copyKey(key: string) {
    navigator.clipboard.writeText(key);
    setCopied(true);
    toast.success("Ingest key copied.");
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="centre_id" value={centreId} />
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">Edge-worker ingest key for {centreCode}</span>
          <span className="text-xs text-muted-foreground">
            Generating a key shows it once and invalidates any previous key for this centre.
          </span>
        </div>
        <Button type="submit" variant="outline" disabled={pending} className="ml-auto">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
          {pending ? "Generating..." : "Generate new key"}
        </Button>
      </form>

      {state?.error && (
        <Alert variant="destructive">
          <OctagonAlert className="size-4" />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      {state?.key && (
        <Alert>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span>Copy it now — it is not stored and cannot be shown again:</span>
            <code className="rounded bg-muted px-2 py-0.5 font-mono text-foreground">{state.key}</code>
            <Button type="button" variant="ghost" size="icon" className="size-6" onClick={() => copyKey(state.key!)}>
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
