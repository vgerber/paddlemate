import Box from "@mui/material/Box";
import { createFileRoute } from "@tanstack/react-router";
import HistoryTimeline from "@/components/provenance/HistoryTimeline";
import SourcesTab from "@/components/provenance/SourcesTab";
import type { HistoryTarget } from "@/components/provenance/types";

/** Host for the History and Sources views until the river panel and the
 * feature menu mount them. Not linked from the app; the e2e specs and a
 * reviewer open it by address. */
export const Route = createFileRoute("/admin/provenance-preview")({
  validateSearch: (search: Record<string, unknown>) => ({
    view:
      search.view === "sources" ? ("sources" as const) : ("history" as const),
    waterway: Number(search.waterway) || 0,
    section: search.section != null ? Number(search.section) : undefined,
    feature: search.feature != null ? Number(search.feature) : undefined,
  }),
  component: ProvenancePreview,
});

function ProvenancePreview() {
  const { view, waterway, section, feature } = Route.useSearch();
  const target: HistoryTarget =
    section != null && feature != null
      ? { waterwayId: waterway, sectionId: section, featureId: feature }
      : section != null
        ? { waterwayId: waterway, sectionId: section }
        : { waterwayId: waterway };
  return (
    <Box sx={{ maxWidth: 720, mx: "auto" }}>
      {view === "sources" ? (
        <SourcesTab waterwayId={waterway} />
      ) : (
        <HistoryTimeline target={target} />
      )}
    </Box>
  );
}
