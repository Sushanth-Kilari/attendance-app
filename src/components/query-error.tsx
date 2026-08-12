import { OctagonAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// Distinguishes "the query failed" from "the query succeeded with zero
// rows" — pages render this instead of silently falling through to an
// empty-state message when a Supabase call actually errored.
export function QueryError({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <OctagonAlert className="size-4" />
      <AlertTitle>Couldn&apos;t load this page</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
