import { Wifi } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { QueryError } from "@/components/query-error";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { NetworkForm } from "./NetworkForm";
import { deleteNetworkRange } from "./actions";

export default async function NetworkPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams;
  const supabase = await createClient();
  const { data: ranges, error } = await supabase.from("network_ranges").select("*").order("created_at");

  if (error) {
    return <QueryError message={error.message} />;
  }

  const editing = edit ? ranges?.find((r) => r.id === edit) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Only devices whose request comes from one of these ranges can use QR self check-in — everything else (a
        student off-campus, a screenshot forwarded to a friend) is rejected regardless of the token. Use CIDR
        notation for a range (e.g. <code className="rounded bg-muted px-1 py-0.5">203.0.113.0/24</code>) or a single
        IP (e.g. <code className="rounded bg-muted px-1 py-0.5">203.0.113.42/32</code>).
      </p>

      <NetworkForm key={editing?.id ?? "new"} editing={editing} />

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead>IP / CIDR</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ranges?.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.label}</TableCell>
                <TableCell className="text-muted-foreground">{r.cidr}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/admin/network?edit=${r.id}`} />}>
                    Edit
                  </Button>
                  <ConfirmDeleteButton
                    id={r.id}
                    description={`Remove "${r.label}" (${r.cidr}) from the allowed check-in network?`}
                    action={deleteNetworkRange}
                  />
                </TableCell>
              </TableRow>
            ))}
            {ranges?.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="h-32 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <Wifi className="size-6 text-muted-foreground/60" />
                    No ranges configured — QR self check-in will reject every scan until you add one.
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
