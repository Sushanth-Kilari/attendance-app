import Link from "next/link";
import { Video } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { QueryError } from "@/components/query-error";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { CameraForm, IngestKeyPanel } from "./CameraForms";
import { deleteCamera } from "./actions";

export default async function CamerasPage({ searchParams }: { searchParams: Promise<{ centre?: string }> }) {
  const { centre: centreParam } = await searchParams;
  const supabase = await createClient();

  const { data: centres, error: centresError } = await supabase.from("centres").select("id, code").order("code");
  if (centresError) {
    return <QueryError message={centresError.message} />;
  }
  if ((centres?.length ?? 0) === 0) {
    return <p className="text-sm text-muted-foreground">Add a centre first, then register its cameras.</p>;
  }

  const centre = centres?.find((c) => c.id === centreParam) ?? centres![0];

  const [{ data: cameras, error: camerasError }, { data: sections, error: sectionsError }] = await Promise.all([
    supabase
      .from("centre_cameras")
      .select("id, label, sections(year, name, academic_year, departments(code))")
      .eq("centre_id", centre.id)
      .order("label"),
    supabase
      .from("sections")
      .select("id, year, name, academic_year, departments(code)")
      .eq("centre_id", centre.id)
      .order("name"),
  ]);

  const queryError = camerasError ?? sectionsError;
  if (queryError) {
    return <QueryError message={queryError.message} />;
  }

  type SectionRow = { year: number; name: string; academic_year: string; departments: { code: string } | { code: string }[] | null };
  const sectionLabel = (s: SectionRow | null | undefined) => {
    if (!s) return null;
    const d = Array.isArray(s.departments) ? s.departments[0] : s.departments;
    return `${d?.code ?? "?"} Y${s.year}-${s.name} (${s.academic_year})`;
  };

  const sectionOptions = (sections ?? []).map((s) => ({ id: s.id, label: sectionLabel(s as SectionRow)! }));

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Register each camera by the label your edge worker uses, and say which batch normally sits in that room — that
        is how an observation is matched to the class session the centre marked attendance for. Only head-counts and
        equipment tallies ever leave the centre; no video or images are uploaded.
      </p>

      <div className="flex flex-wrap gap-2">
        {centres?.map((c) => (
          <Button
            key={c.id}
            size="sm"
            variant={c.id === centre.id ? "default" : "outline"}
            nativeButton={false}
            render={<Link href={`/admin/cameras?centre=${c.id}`} />}
          >
            {c.code}
          </Button>
        ))}
      </div>

      <IngestKeyPanel centreId={centre.id} centreCode={centre.code} />

      <CameraForm key={centre.id} centreId={centre.id} sections={sectionOptions} />

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Camera label</TableHead>
              <TableHead>Batch in room</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cameras?.map((cam) => {
              const section = Array.isArray(cam.sections) ? cam.sections[0] : cam.sections;
              return (
                <TableRow key={cam.id}>
                  <TableCell className="font-medium">{cam.label}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {sectionLabel(section as SectionRow | null) ?? "Centre-level only"}
                  </TableCell>
                  <TableCell className="text-right">
                    <ConfirmDeleteButton
                      id={cam.id}
                      description={`Remove camera "${cam.label}"? Past observations are kept.`}
                      action={deleteCamera}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
            {cameras?.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="h-32 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <Video className="size-6 text-muted-foreground/60" />
                    No cameras registered for {centre.code}.
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
