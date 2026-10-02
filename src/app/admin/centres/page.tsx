import Link from "next/link";
import { MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { QueryError } from "@/components/query-error";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { AREA_LABELS } from "@/lib/centres";
import { CentreForm } from "./CentreForm";
import { deleteCentre } from "./actions";

export default async function CentresPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams;
  const supabase = await createClient();
  const { data: centres, error } = await supabase.from("centres").select("*").order("code");

  if (error) {
    return <QueryError message={error.message} />;
  }

  const editing = edit ? centres?.find((c) => c.id === edit) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Empanelled training centres. Assign batches (sections) to a centre, then record its sanctioned inventory —
        that is the baseline the camera analytics checks against.
      </p>

      <CentreForm key={editing?.id ?? "new"} editing={editing} />

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Area</TableHead>
              <TableHead className="w-48 text-right">Actions</TableHead>
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
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    nativeButton={false}
                    render={<Link href={`/admin/inventory?centre=${c.id}`} />}
                  >
                    Inventory
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    nativeButton={false}
                    render={<Link href={`/admin/centres?edit=${c.id}`} />}
                  >
                    Edit
                  </Button>
                  <ConfirmDeleteButton
                    id={c.id}
                    description={`Delete centre "${c.code}"? Its sanctioned inventory is deleted too; batches are unlinked, not deleted.`}
                    action={deleteCentre}
                  />
                </TableCell>
              </TableRow>
            ))}
            {centres?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
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
