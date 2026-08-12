"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createManualCircular, draftCircularWithAI } from "./actions";

export function NewCircularForm() {
  const [occasion, setOccasion] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [drafting, startDrafting] = useTransition();
  const [saving, startSaving] = useTransition();

  function handleDraft() {
    if (!occasion.trim()) {
      toast.error("Describe the occasion first.");
      return;
    }
    startDrafting(async () => {
      const result = await draftCircularWithAI(occasion);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setTitle(result.title);
      setBody(result.body);
    });
  }

  function handleSave() {
    startSaving(async () => {
      const result = await createManualCircular(title, body);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Draft added to your queue below.");
      setOccasion("");
      setTitle("");
      setBody("");
    });
  }

  const pending = drafting || saving;

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <p className="text-sm font-medium">New circular</p>
      <p className="text-sm text-muted-foreground">
        For anything outside the holiday calendar — write it yourself, or describe the occasion and let AI
        draft it. Either way it lands in the queue below for you to review before sending.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-1 min-w-48 flex-col gap-1.5">
          <Label htmlFor="occasion">Occasion</Label>
          <Input
            id="occasion"
            placeholder="e.g. Sudden holiday for local elections on Nov 4"
            value={occasion}
            onChange={(e) => setOccasion(e.target.value)}
            disabled={pending}
          />
        </div>
        <Button type="button" variant="outline" onClick={handleDraft} disabled={pending}>
          {drafting ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
          Draft with AI
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="manual-title">Title</Label>
        <Input id="manual-title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={pending} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="manual-body">Body</Label>
        <Textarea id="manual-body" value={body} onChange={(e) => setBody(e.target.value)} disabled={pending} rows={4} />
      </div>

      <div>
        <Button type="button" onClick={handleSave} disabled={pending || !title.trim() || !body.trim()}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Save as draft
        </Button>
      </div>
    </div>
  );
}
