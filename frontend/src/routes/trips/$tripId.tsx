import Box from "@mui/material/Box";
import useMediaQuery from "@mui/material/useMediaQuery";
import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import EmptyState from "@/components/states/EmptyState";
import ErrorState from "@/components/states/ErrorState";
import LoadingBox from "@/components/states/LoadingBox";
import TripDetail from "@/components/trip-page/TripDetail";
import { useGoBack } from "@/lib/hooks/useGoBack";
import { useTrip } from "@/lib/hooks/useTrips";
import { PANEL_HEIGHT, theme } from "@/lib/theme";

export const Route = createFileRoute("/trips/$tripId")({
  validateSearch: (search: Record<string, unknown>) => ({
    // Absent unless editing, so an open trip carries no `?edit=false`.
    edit:
      search.edit === true || search.edit === "true"
        ? (true as boolean)
        : undefined,
  }),
  component: TripDetailPage,
});

/** The trip as its own screen: the mobile overlay, and the target of any
 * direct link. Desktop opens the same view beside the list instead. */
function TripDetailPage() {
  const navigate = useNavigate();
  const goBack = useGoBack(() => navigate({ to: "/trips", replace: true }));
  const { tripId } = Route.useParams();
  const { edit } = Route.useSearch();
  const tripQuery = useTrip(Number(tripId));
  const { data: trip, isLoading } = tripQuery;
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"), { noSsr: true });

  // Desktop shows the trip beside the list; this address stays a valid link.
  if (isDesktop) {
    return (
      <Navigate
        to="/trips"
        search={{ selected: Number(tripId), edit: edit || undefined }}
        replace
      />
    );
  }

  if (isLoading) return <LoadingBox size={40} pt={8} />;

  if (!trip) {
    // A failed load keeps its own message; only a clean miss is "not found".
    if (tripQuery.isError) {
      return (
        <ErrorState
          error={tripQuery.error}
          fallback="Could not load this trip."
          onRetry={() => tripQuery.refetch()}
          py={8}
        />
      );
    }
    return <EmptyState title="Trip not found." py={8} />;
  }

  return (
    <Box
      sx={{
        position: "relative",
        maxWidth: 720,
        mx: "auto",
        height: PANEL_HEIGHT,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <TripDetail
        trip={trip}
        editing={edit === true}
        onEditingChange={(value) =>
          navigate({
            to: "/trips/$tripId",
            params: { tripId },
            search: { edit: value || undefined },
            replace: true,
          })
        }
        onClose={goBack}
        onDeleted={() => navigate({ to: "/trips", replace: true })}
      />
    </Box>
  );
}
