import Box from "@mui/material/Box";
import useMediaQuery from "@mui/material/useMediaQuery";
import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import LoadingBox from "@/components/states/LoadingBox";
import TripForm from "@/components/trips/TripForm";
import { useGoBack } from "@/lib/hooks/useGoBack";
import { useSession } from "@/lib/hooks/useSession";
import { PANEL_HEIGHT, theme } from "@/lib/theme";

export const Route = createFileRoute("/trips/new")({
  component: NewTripPage,
});

function NewTripPage() {
  const navigate = useNavigate();
  const goBack = useGoBack(() => navigate({ to: "/trips", replace: true }));
  const { isAuthenticated, isLoading } = useSession();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"), { noSsr: true });

  if (isLoading) return <LoadingBox size={40} pt={8} />;
  if (!isAuthenticated) return <Navigate to="/trips" />;
  // Beside the list, like the trip it will become.
  if (isDesktop) return <Navigate to="/trips" search={{ new: true }} replace />;

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
            search: { edit: undefined },
            replace: true,
          })
        }
        onCancel={goBack}
      />
    </Box>
  );
}
