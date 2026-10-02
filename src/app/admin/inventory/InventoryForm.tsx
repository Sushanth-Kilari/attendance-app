"use client";

import Link from "next/link";
import { Loader2, Plus } from "lucide-react";
import { useToastAction } from "@/hooks/use-toast-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORY_LABELS } from "@/lib/centres";
import { createInventoryItem, updateInventoryItem } from "./actions";

type Item = { id: string; category: string; item_name: string; sanctioned_qty: number };

export function InventoryForm({ centreId, editing }: { centreId: string; editing?: Item }) {
  const action = editing ? updateInventoryItem : createInventoryItem;
  const [, formAction, pending] = useToastAction(action, editing ? "Item updated." : "Item added.");

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <input type="hidden" name="centre_id" value={centreId} />
      {editing && <input type="hidden" name="id" value={editing.id} />}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="category">Category</Label>
        <Select name="category" defaultValue={editing?.category ?? "workbench"} required>
          <SelectTrigger id="category" className="w-36">
            <SelectValue>{(value: string) => CATEGORY_LABELS[value] ?? value}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="item_name">Item</Label>
        <Input id="item_name" name="item_name" defaultValue={editing?.item_name} required placeholder="Welding bench" className="w-56" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sanctioned_qty">Sanctioned qty</Label>
        <Input
          id="sanctioned_qty"
          type="number"
          name="sanctioned_qty"
          min={0}
          defaultValue={editing?.sanctioned_qty}
          required
          className="w-28"
        />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : editing ? null : <Plus className="size-4" />}
        {pending ? "Saving..." : editing ? "Save" : "Add item"}
      </Button>

      {editing && (
        <Button variant="ghost" nativeButton={false} render={<Link href={`/admin/inventory?centre=${centreId}`} />}>
          Cancel
        </Button>
      )}
    </form>
  );
}
