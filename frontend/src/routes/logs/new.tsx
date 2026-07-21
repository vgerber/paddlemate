import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import DescentForm from "@/components/descents/DescentForm";
import { useSession } from "@/lib/hooks/useSession";
import { useSectionWithFeatures } from "@/lib/hooks/useWaterways";

export const Route = createFileRoute("/logs/new")({
  validateSearch: (search: Record<string, unknown>) => ({
    waterwayId:
      search.waterwayId != null ? Number(search.waterwayId) : undefined,
    sectionId: search.sectionId != null ? Number(search.sectionId) : undefined,
    startTime:
      typeof search.startTime === "string"
        ? search.startTime || undefined
        : undefined,
  }),
  component: NewLogPage,
});

function NewLogPage() {
  const navigate = useNavigate();
  const { waterwayId, sectionId, startTime } = Route.useSearch();
  const { isAuthenticated, isLoading: sessionLoading } = useSession();

  const hasInitialSection = waterwayId != null && sectionId != null;
  const { data: section, isLoading: sectionLoading } = useSectionWithFeatures(
    waterwayId ?? 0,
    hasInitialSection ? sectionId : null,
  );

  if (sessionLoading || (hasInitialSection && sectionLoading)) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", pt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!isAuthenticated) return <Navigate to="/logs" />;

  return (
    <Box sx={{ maxWidth: 720, mx: "auto", px: 2, py: 2 }}>
      <DescentForm
        initialSection={
          hasInitialSection && section && waterwayId != null
            ? { section, waterwayId }
            : undefined
        }
        initialStartTime={startTime}
        onSave={(id) =>
          navigate({
            to: "/logs/$descentId",
            params: { descentId: String(id) },
            search: { edit: false },
            replace: true,
          })
        }
        onCancel={() => history.back()}
      />
    </Box>
  );
}
