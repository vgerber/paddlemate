import { createFileRoute, useNavigate } from "@tanstack/react-router";
import Box from "@mui/material/Box";
import WaterwayMap from "@/components/Map";
import SectionChartPanel from "@/components/SectionChartPanel";
import WaterwayDetailPanel from "@/components/WaterwayDetailPanel";
import WaterwaySearchPanel from "@/components/WaterwaySearchPanel";
import { useWaterway } from "@/lib/hooks/useWaterways";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => ({
    waterway: search.waterway ? Number(search.waterway) : undefined,
    section: search.section ? Number(search.section) : undefined,
  }),
  component: Home,
});

function Home() {
  const { waterway: selectedWaterwayId, section: selectedSectionId } =
    Route.useSearch();
  const navigate = useNavigate({ from: "/" });

  const setSelectedWaterwayId = (id: number | undefined) =>
    navigate({
      search: (prev) => ({ ...prev, waterway: id, section: undefined }),
    });
  const setSelectedSectionId = (id: number | undefined) =>
    navigate({ search: (prev) => ({ ...prev, section: id }) });

  const { data: selectedWaterway } = useWaterway(selectedWaterwayId ?? null);
  const sections = selectedWaterway?.sections ?? [];

  const handleSectionClick = (id: number) =>
    setSelectedSectionId(id === selectedSectionId ? undefined : id);

  return (
    <Box sx={{ display: "flex", height: "calc(100vh - 48px)" }}>
      {/* Sidebar */}
      <Box
        sx={{
          width: 360,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          borderRight: "1px solid",
          borderColor: "divider",
          flexShrink: 0,
        }}
      >
        {selectedWaterwayId == null ? (
          <WaterwaySearchPanel onSelect={setSelectedWaterwayId} />
        ) : (
          <WaterwayDetailPanel
            waterwayId={selectedWaterwayId}
            selectedSectionId={selectedSectionId}
            onBack={() => setSelectedWaterwayId(undefined)}
            onSectionClick={handleSectionClick}
          />
        )}
      </Box>

      {/* Map + chart */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <WaterwayMap
            sections={sections}
            selectedSectionId={selectedSectionId}
            onSectionClick={handleSectionClick}
          />
        </Box>
        {selectedSectionId != null && selectedWaterwayId != null && (
          <SectionChartPanel
            waterwayId={selectedWaterwayId}
            sectionId={selectedSectionId}
            sectionName={sections.find((s) => s.id === selectedSectionId)?.name}
          />
        )}
      </Box>
    </Box>
  );
}
