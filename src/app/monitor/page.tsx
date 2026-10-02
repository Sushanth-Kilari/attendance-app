import { MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { QueryError } from "@/components/query-error";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AREA_LABELS } from "@/lib/centres";

// Phase 1 landing view: centres and their sanctioned baseline. Discrepancy
// ranking and drill-downs land here once video observations exist.
export default async function MonitorPage() {
  const supabase = await createClient();

  const [{ data: centres, error: centresError }, { data: inventory, error: inventoryError }] = await Promise.all([
    supabase.from("centres").select("id, code, name, state, district, area_type").order("code"),
    supabase.from("centre_inventory").select("centre_id, category, sanctioned_qty"),
  ]);

  const queryError = centresError ?? inventoryError;
  if (queryError) {
    return <QueryError message={queryError.message} />;
  }

  const seatsByCentre = new Map<string, number>();
  const itemsByCentre = new Map<string, number>();
  for (const i of inventory ?? []) {
    itemsByCentre.set(i.centre_id, (itemsByCentre.get(i.centre_id) ?? 0) + i.sanctioned_qty);
    if (i.category === "seating") seatsByCentre.set(i.centre_id, (seatsByCentre.get(i.centre_id) ?? 0) + i.sanctioned_qty);
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Empanelled training centres and their sanctioned baseline. Attendance discrepancies and infrastructure gaps
        flagged from camera analytics will be ranked here.
      </p>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Area</TableHead>
              <TableHead className="text-right">Sanctioned seats</TableHead>
              <TableHead className="text-right">Sanctioned items</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {centres?.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.code}</TableCell>
                <TableCell className="text-muted-foreground">{c.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {c.district}, {c.state}
                </TableCell>
                <TableCell className="text-muted-foreground">{AREA_LABELS[c.area_type] ?? c.area_type}</TableCell>
                <TableCell className="text-right tabular-nums">{seatsByCentre.get(c.id) ?? 0}</TableCell>
                <TableCell className="text-right tabular-nums">{itemsByCentre.get(c.id) ?? 0}</TableCell>
              </TableRow>
            ))}
            {centres?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <MapPin className="size-6 text-muted-foreground/60" />
                    No centres yet.
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
