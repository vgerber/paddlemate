import Box from "@mui/material/Box";
import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import LoadingBox from "@/components/states/LoadingBox";
import TripForm from "@/components/trips/TripForm";
import { useSession } from "@/lib/hooks/useSession";
import { PANEL_HEIGHT } from "@/lib/theme";

export const Route = createFileRoute("/trips/new")({
  component: NewTripPage,
});

function NewTripPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useSession();

  if (isLoading) return <LoadingBox size={40} pt={8} />;
  if (!isAuthenticated) return <Navigate to="/trips" />;

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
      <TripForm
        onSave={(id) =>
          navigate({
            to: "/trips/$tripId",
            params: { tripId: String(id) },
            search: { edit: false },
            replace: true,
          })
        }
        onCancel={() => history.back()}
      />
    </Box>
  );
}
