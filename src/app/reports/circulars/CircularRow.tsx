"use client";

import { useState, useTransition } from "react";
import { Loader2, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { approveCircular, rejectCircular } from "./actions";

type PendingCircular = { id: string; title: string; body: string };

export function CircularRow({ circular }: { circular: PendingCircular }) {
  const [title, setTitle] = useState(circular.title);
  const [body, setBody] = useState(circular.body);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  function handleApprove() {
    startTransition(async () => {
      const result = await approveCircular(circular.id, title, body);
      if (result?.error) toast.error(result.error);
      else toast.success("Sent to your department.");
    });
  }

  function handleReject() {
    startTransition(async () => {
      const result = await rejectCircular(circular.id, reason);
      if (result?.error) toast.error(result.error);
      else toast.success("Circular rejected.");
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`title-${circular.id}`}>Title</Label>
        <Input
          id={`title-${circular.id}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={pending}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`body-${circular.id}`}>Body</Label>
        <Textarea
          id={`body-${circular.id}`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={pending}
          rows={4}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Will email every active student in your department. This can{"’"}t be undone.
        </p>

        <div className="flex shrink-0 gap-2">
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="outline" size="sm" disabled={pending} />}>
              <X className="size-4" />
              Reject
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reject this circular?</AlertDialogTitle>
                <AlertDialogDescription>
                  It won{"’"}t be sent. You can optionally note why, for your own records.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Textarea
                placeholder="Reason (optional)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
              />
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleReject}>Reject</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger render={<Button size="sm" disabled={pending} />}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Approve & Send
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Send this circular now?</AlertDialogTitle>
                <AlertDialogDescription>
                  It will be emailed immediately to every active student in your department, using the
                  title and body as currently written above.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleApprove}>Approve & Send</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}
