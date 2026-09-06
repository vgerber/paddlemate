import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import LoadingBox from "@/components/states/LoadingBox";
import TripDetail from "@/components/trip-page/TripDetail";
import { useTrip } from "@/lib/hooks/useTrips";
import { PANEL_HEIGHT } from "@/lib/theme";

export const Route = createFileRoute("/trips/$tripId")({
  validateSearch: (search: Record<string, unknown>) => ({
    edit: search.edit === true || search.edit === "true",
  }),
  component: TripDetailPage,
});

/** The trip as its own screen: the mobile overlay, and the target of any
 * direct link. Desktop opens the same view beside the list instead. */
function TripDetailPage() {
  const navigate = useNavigate();
  const { tripId } = Route.useParams();
  const { edit } = Route.useSearch();
  const { data: trip, isLoading } = useTrip(Number(tripId));

  if (isLoading) return <LoadingBox size={40} pt={8} />;

  if (!trip) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", pt: 8 }}>
        <Typography variant="body2" color="text.disabled">
          Trip not found.
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        maxWidth: 720,
        mx: "auto",
        height: PANEL_HEIGHT,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <TripDetail
        trip={trip}
        editing={edit}
        onEditingChange={(value) =>
          navigate({
            to: "/trips/$tripId",
            params: { tripId },
            search: { edit: value },
            replace: true,
          })
        }
        onClose={() => history.back()}
        onDeleted={() => navigate({ to: "/trips", replace: true })}
      />
    </Box>
  );
}
