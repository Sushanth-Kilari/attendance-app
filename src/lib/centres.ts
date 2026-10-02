// Shared (server + client safe) labels for centre/inventory enums. Kept out
// of the "use client" form files so server components get the real object,
// not a client-reference proxy.
export const AREA_LABELS: Record<string, string> = { rural: "Rural", semi_urban: "Semi-urban", urban: "Urban" };

export const CATEGORY_LABELS: Record<string, string> = {
  seating: "Seating",
  workbench: "Workbench",
  machinery: "Machinery",
  computer: "Computer",
  other: "Other",
};
