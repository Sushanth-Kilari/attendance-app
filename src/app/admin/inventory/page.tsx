import Link from "next/link";
import { Package } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { QueryError } from "@/components/query-error";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { CATEGORY_LABELS } from "@/lib/centres";
import { InventoryForm } from "./InventoryForm";
import { deleteInventoryItem } from "./actions";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ centre?: string; edit?: string }>;
}) {
  const { centre: centreParam, edit } = await searchParams;
  const supabase = await createClient();

  const { data: centres, error: centresError } = await supabase.from("centres").select("id, code, name").order("code");
  if (centresError) {
    return <QueryError message={centresError.message} />;
  }

  if ((centres?.length ?? 0) === 0) {
    return <p className="text-sm text-muted-foreground">Add a centre first, then record its sanctioned inventory.</p>;
  }

  const centre = centres?.find((c) => c.id === centreParam) ?? centres![0];

  const { data: items, error: itemsError } = await supabase
    .from("centre_inventory")
    .select("id, category, item_name, sanctioned_qty")
    .eq("centre_id", centre.id)
    .order("category")
    .order("item_name");
  if (itemsError) {
    return <QueryError message={itemsError.message} />;
  }

  const editing = edit ? items?.find((i) => i.id === edit) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Sanctioned inventory for the selected centre. Observed equipment from the cameras is compared against these
        quantities; seating also bounds the plausible head-count.
      </p>

      <div className="flex flex-wrap gap-2">
        {centres?.map((c) => (
          <Button
            key={c.id}
            size="sm"
            variant={c.id === centre.id ? "default" : "outline"}
            nativeButton={false}
            render={<Link href={`/admin/inventory?centre=${c.id}`} />}
          >
            {c.code}
          </Button>
        ))}
      </div>

      <InventoryForm key={editing?.id ?? `new-${centre.id}`} centreId={centre.id} editing={editing} />

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Sanctioned qty</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items?.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="text-muted-foreground">{CATEGORY_LABELS[i.category] ?? i.category}</TableCell>
                <TableCell className="font-medium">{i.item_name}</TableCell>
                <TableCell className="text-right tabular-nums">{i.sanctioned_qty}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    nativeButton={false}
                    render={<Link href={`/admin/inventory?centre=${centre.id}&edit=${i.id}`} />}
                  >
                    Edit
                  </Button>
                  <ConfirmDeleteButton
                    id={i.id}
                    description={`Remove "${i.item_name}" from ${centre.code}'s sanctioned inventory?`}
                    action={deleteInventoryItem}
                  />
                </TableCell>
              </TableRow>
            ))}
            {items?.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <Package className="size-6 text-muted-foreground/60" />
                    No inventory recorded for {centre.code}.
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
