import LinkOffOutlinedIcon from "@mui/icons-material/LinkOffOutlined";
import LuggageOutlinedIcon from "@mui/icons-material/LuggageOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import EmptyState from "@/components/states/EmptyState";
import LoadingBox from "@/components/states/LoadingBox";
import { apiErrorMessage } from "@/lib/api/client";
import { dateRange } from "@/lib/format";
import { useSession } from "@/lib/hooks/useSession";
import { useInvitePreview, useJoinByInvite } from "@/lib/hooks/useTrips";
import { labelSx, theme } from "@/lib/theme";

export const Route = createFileRoute("/invite/$token")({
  component: InvitePage,
});

/**
 * Where an invite link lands. Most people arriving here have no account yet,
 * so the page first says what they are joining and who asked them, then
 * offers sign-in or sign-up - both of which come back here - and only then
 * the join itself.
 */
function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const {
    isAuthenticated,
    isLoading: sessionLoading,
    login,
    signup,
  } = useSession();
  const preview = useInvitePreview(token, !sessionLoading);
  const join = useJoinByInvite();

  if (sessionLoading || preview.isLoading) {
    return <LoadingBox size={40} pt={10} />;
  }

  if (!preview.data) {
    return (
      <EmptyState
        icon={
          <LinkOffOutlinedIcon sx={{ fontSize: 56, color: "text.disabled" }} />
        }
        title="This invite link has expired or was withdrawn."
        caption="Ask whoever sent it for a new one."
        py={10}
      />
    );
  }

  const trip = preview.data;
  // Desktop opens a trip beside the list, a phone on its own screen.
  const openTrip = () =>
    isDesktop
      ? navigate({ to: "/trips", search: { selected: trip.trip_id } })
      : navigate({
          to: "/trips/$tripId",
          params: { tripId: String(trip.trip_id) },
          search: { edit: false },
        });

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        pt: 10,
        px: 2,
        textAlign: "center",
      }}
    >
      <LuggageOutlinedIcon sx={{ fontSize: 56, color: "text.disabled" }} />
      <Box>
        <Typography sx={{ ...labelSx, color: "text.disabled" }}>
          {trip.invited_by} invited you to
        </Typography>
        <Typography variant="h6">{trip.name}</Typography>
        <Typography variant="body2" color="text.secondary">
          {dateRange(trip.start_date, trip.end_date)}
        </Typography>
      </Box>

      <JoinAction
        signedIn={isAuthenticated}
        alreadyMember={trip.viewer_is_member}
        joining={join.isPending}
        onLogin={login}
        onSignup={signup}
        onOpen={openTrip}
        onJoin={() =>
          join.mutate({ tripId: trip.trip_id, token }, { onSuccess: openTrip })
        }
      />

      {join.isError && (
        <Alert severity="error" sx={{ maxWidth: 360 }}>
          {apiErrorMessage(join.error, "Joining failed. Please try again.")}
        </Alert>
      )}
    </Box>
  );
}

/** The one thing to do next, which depends on who is looking. */
function JoinAction({
  signedIn,
  alreadyMember,
  joining,
  onLogin,
  onSignup,
  onOpen,
  onJoin,
}: {
  signedIn: boolean;
  alreadyMember: boolean;
  joining: boolean;
  onLogin: () => void;
  onSignup: () => void;
  onOpen: () => void;
  onJoin: () => void;
}) {
  if (!signedIn) {
    return (
      <>
        <Button variant="contained" color="secondary" onClick={onLogin}>
          Sign in to join
        </Button>
        <Link
          component="button"
          type="button"
          variant="body2"
          color="text.secondary"
          onClick={onSignup}
        >
          New here? Create an account
        </Link>
      </>
    );
  }

  if (alreadyMember) {
    return (
      <>
        <Typography variant="body2" color="text.secondary">
          You are already on this trip.
        </Typography>
        <Button variant="contained" color="secondary" onClick={onOpen}>
          Open trip
        </Button>
      </>
    );
  }

  return (
    <Button
      variant="contained"
      color="secondary"
      onClick={onJoin}
      disabled={joining}
    >
      {joining ? "Joining…" : "Join trip"}
    </Button>
  );
}
