import { Megaphone } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { QueryError } from "@/components/query-error";
import { Badge } from "@/components/ui/badge";
import { CircularRow } from "./CircularRow";
import { NewCircularForm } from "./NewCircularForm";

const STATUS_VARIANT = {
  pending_approval: "outline",
  approved: "secondary",
  sent: "default",
  rejected: "destructive",
} as const;

export default async function CircularsPage() {
  const { profile } = await requireRole("hod", "admin");
  const supabase = await createClient();

  const isAdmin = profile.role === "admin";
  const query = isAdmin
    ? supabase.from("circulars").select("*, departments(code)").order("created_at", { ascending: false })
    : supabase.from("circulars").select("*").order("created_at", { ascending: false });

  const { data: circulars, error } = await query;
  if (error) return <QueryError message={error.message} />;

  const pending = (circulars ?? []).filter((c) => c.status === "pending_approval");
  const decided = (circulars ?? []).filter((c) => c.status !== "pending_approval");

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        {isAdmin
          ? "Read-only oversight — each department's HOD reviews, edits, and sends their own circulars."
          : "Auto-drafted circulars from the holiday calendar, plus anything you write yourself, wait here until you approve and send them."}
      </p>

      {!isAdmin && <NewCircularForm />}

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Pending approval {pending.length > 0 && `(${pending.length})`}
        </h2>
        {pending.length === 0 && (
          <div className="flex h-24 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-muted-foreground">
            <Megaphone className="size-5 text-muted-foreground/60" />
            Nothing waiting on you right now.
          </div>
        )}
        {!isAdmin &&
          pending.map((c) => <CircularRow key={c.id} circular={{ id: c.id, title: c.title, body: c.body }} />)}
        {isAdmin &&
          pending.map((c) => (
            <div key={c.id} className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{c.title}</p>
                <Badge variant="outline">{(c as { departments?: { code: string } }).departments?.code}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{c.body}</p>
            </div>
          ))}
      </div>

      {decided.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-muted-foreground">History</h2>
          <div className="flex flex-col gap-2">
            {decided.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3 shadow-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.status === "sent" &&
                      `Sent to ${c.recipient_count ?? 0} students by email` +
                        (c.whatsapp_sent_count ? `, ${c.whatsapp_sent_count} by WhatsApp` : "")}
                    {c.status === "rejected" && (c.rejection_reason ? `Rejected: ${c.rejection_reason}` : "Rejected")}
                    {isAdmin && (c as { departments?: { code: string } }).departments?.code
                      ? ` · ${(c as { departments?: { code: string } }).departments?.code}`
                      : ""}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[c.status as keyof typeof STATUS_VARIANT]} className="shrink-0 capitalize">
                  {c.status.replace("_", " ")}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
