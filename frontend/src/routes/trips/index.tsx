import AddIcon from "@mui/icons-material/Add";
import LuggageOutlinedIcon from "@mui/icons-material/LuggageOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Fab from "@mui/material/Fab";
import useMediaQuery from "@mui/material/useMediaQuery";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import EmptyState from "@/components/states/EmptyState";
import LoadingBox from "@/components/states/LoadingBox";
import SignInGate from "@/components/states/SignInGate";
import TripDetail from "@/components/trip-page/TripDetail";
import { fabSx } from "@/components/trip-page/TripFab";
import TripForm from "@/components/trips/TripForm";
import TripRow from "@/components/trips/TripRow";
import { useSession } from "@/lib/hooks/useSession";
import { useTrip, useTrips } from "@/lib/hooks/useTrips";
import { theme } from "@/lib/theme";

export const Route = createFileRoute("/trips/")({
  // All optional, so /trips is always a valid link.
  validateSearch: (
    search: Record<string, unknown>,
  ): { selected?: number; edit?: boolean; new?: boolean } => ({
    // Which trip the desktop detail pane shows; keeps it linkable.
    selected: search.selected != null ? Number(search.selected) : undefined,
    edit: search.edit === true || search.edit === "true" ? true : undefined,
    new: search.new === true || search.new === "true" ? true : undefined,
  }),
  component: TripsPage,
});

function TripsPage() {
  const navigate = useNavigate({ from: "/trips/" });
  const { selected, edit, new: creating } = Route.useSearch();
  const { isAuthenticated, isLoading: sessionLoading } = useSession();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));

  // A trip is invite-only, so the listing is simply the caller's trips.
  const { data, isLoading } = useTrips({}, isAuthenticated);
  const { data: selectedTrip } = useTrip(isDesktop ? (selected ?? null) : null);
  const trips = data?.items ?? [];

  const openTrip = (id: number) => {
    // Desktop opens beside the list; mobile replaces the screen with it.
    if (isDesktop) navigate({ search: (prev) => ({ ...prev, selected: id }) });
    else
      navigate({
        to: "/trips/$tripId",
        params: { tripId: String(id) },
        search: { edit: false },
      });
  };

  if (sessionLoading) return <LoadingBox size={40} pt={8} />;

  if (!isAuthenticated) {
    return (
      <SignInGate
        icon={
          <LuggageOutlinedIcon sx={{ fontSize: 56, color: "text.disabled" }} />
        }
        title="Sign in to plan trips"
      />
    );
  }

  const list = (
    <>
      {isLoading ? (
        <LoadingBox size={40} pt={6} />
      ) : trips.length === 0 ? (
        <EmptyState
          icon={
            <LuggageOutlinedIcon
              sx={{ fontSize: 48, color: "text.disabled" }}
            />
          }
          title="No trips yet."
          py={8}
        />
      ) : (
        <Box>
          {trips.map((t) => (
            <TripRow
              key={t.id}
              trip={t}
              selected={isDesktop && t.id === selected}
              onSelect={() => openTrip(t.id)}
            />
          ))}
        </Box>
      )}
    </>
  );

  if (!isDesktop) {
    return (
      <>
        <Box sx={{ maxWidth: 720, mx: "auto" }}>{list}</Box>
        <Fab
          color="secondary"
          onClick={() => navigate({ to: "/trips/new" })}
          aria-label="New trip"
          sx={fabSx}
        >
          <AddIcon />
        </Fab>
      </>
    );
  }

  // Desktop: the trip list beside the open trip, so moving between a week's
  // plan and the others never costs a navigation round trip.
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          md: "380px minmax(0, 1fr)",
          lg: "420px minmax(0, 1fr)",
        },
        height: "calc(100vh - 48px)",
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          bgcolor: theme.tokens.surfaceLow,
          borderRight: "1px solid",
          borderColor: `${theme.tokens.outlineVariant}55`,
        }}
      >
        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>{list}</Box>
        {/* Docked, so it never floats over the last trip in the list. */}
        <Box
          sx={{
            px: 1.5,
            py: 1,
            display: "flex",
            gap: 1,
            flexShrink: 0,
            borderTop: "1px solid",
            borderColor: "divider",
          }}
        >
          <Button
            size="small"
            startIcon={<AddIcon />}
            variant="outlined"
            fullWidth
            onClick={() =>
              navigate({
                search: (prev) => ({ ...prev, new: true, selected: undefined }),
              })
            }
          >
            New trip
          </Button>
        </Box>
      </Box>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          px: 2,
          pt: 1.5,
        }}
      >
        {creating ? (
          <Box
            sx={{
              maxWidth: 880,
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <TripForm
              onSave={(id) =>
                navigate({
                  search: (prev) => ({
                    ...prev,
                    new: undefined,
                    selected: id,
                  }),
                })
              }
              onCancel={() =>
                navigate({ search: (prev) => ({ ...prev, new: undefined }) })
              }
            />
          </Box>
        ) : selectedTrip ? (
          <Box
            sx={{
              maxWidth: 880,
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <TripDetail
              trip={selectedTrip}
              embedded
              editing={edit === true}
              onEditingChange={(v) =>
                navigate({
                  search: (prev) => ({ ...prev, edit: v || undefined }),
                })
              }
              onClose={() =>
                navigate({
                  search: (prev) => ({
                    ...prev,
                    selected: undefined,
                    edit: undefined,
                  }),
                })
              }
              onDeleted={() =>
                navigate({
                  search: (prev) => ({
                    ...prev,
                    selected: undefined,
                    edit: undefined,
                  }),
                })
              }
            />
          </Box>
        ) : (
          <EmptyState
            icon={
              <LuggageOutlinedIcon
                sx={{ fontSize: 56, color: "text.disabled" }}
              />
            }
            title="Pick a trip to open its plan."
            py={10}
          />
        )}
      </Box>
    </Box>
  );
}
