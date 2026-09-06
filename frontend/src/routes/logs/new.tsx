import Box from "@mui/material/Box";
import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import DescentForm from "@/components/descents/DescentForm";
import LoadingBox from "@/components/states/LoadingBox";
import { useDescent } from "@/lib/hooks/useDescents";
import { useSectionWithFeatures } from "@/lib/hooks/useSections";
import { useSession } from "@/lib/hooks/useSession";

/** All optional, so a caller only names the context it actually has. */
export interface NewLogSearch {
  waterwayId?: number;
  sectionId?: number;
  startTime?: string;
  tripId?: number;
  copyDescentId?: number;
}

export const Route = createFileRoute("/logs/new")({
  validateSearch: (search: Record<string, unknown>): NewLogSearch => ({
    waterwayId:
      search.waterwayId != null ? Number(search.waterwayId) : undefined,
    sectionId: search.sectionId != null ? Number(search.sectionId) : undefined,
    startTime:
      typeof search.startTime === "string"
        ? search.startTime || undefined
        : undefined,
    tripId: search.tripId != null ? Number(search.tripId) : undefined,
    copyDescentId:
      search.copyDescentId != null ? Number(search.copyDescentId) : undefined,
  }),
  component: NewLogPage,
});

function NewLogPage() {
  const navigate = useNavigate();
  const { waterwayId, sectionId, startTime, tripId, copyDescentId } =
    Route.useSearch();
  const { isAuthenticated, isLoading: sessionLoading } = useSession();

  const hasInitialSection = waterwayId != null && sectionId != null;
  const { data: section, isLoading: sectionLoading } = useSectionWithFeatures(
    waterwayId ?? 0,
    hasInitialSection ? sectionId : null,
  );

  // Copying a mate's log pre-fills from theirs and saves a new one owned by
  // the copier, with the same trip.
  const { data: copyFrom, isLoading: copyLoading } = useDescent(
    copyDescentId ?? null,
  );

  if (sessionLoading || (hasInitialSection && sectionLoading) || copyLoading) {
    return <LoadingBox size={40} pt={8} />;
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
        initialTripId={tripId}
        copyFrom={copyFrom}
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
