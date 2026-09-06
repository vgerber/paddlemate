import AddIcon from "@mui/icons-material/Add";
import LuggageOutlinedIcon from "@mui/icons-material/LuggageOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Fab from "@mui/material/Fab";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import useMediaQuery from "@mui/material/useMediaQuery";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import EmptyState from "@/components/states/EmptyState";
import LoadingBox from "@/components/states/LoadingBox";
import SignInGate from "@/components/states/SignInGate";
import TripDetail, { fabSx } from "@/components/trip-page/TripDetail";
import TripForm from "@/components/trips/TripForm";
import TripRow from "@/components/trips/TripRow";
import type { TripFilters } from "@/lib/api";
import { useSession } from "@/lib/hooks/useSession";
import { useTrip, useTrips } from "@/lib/hooks/useTrips";
import { theme } from "@/lib/theme";

const TABS = [
  { value: "mine", label: "Mine" },
  { value: "discover", label: "Discover" },
] as const;

type TripTab = (typeof TABS)[number]["value"];

export const Route = createFileRoute("/trips/")({
  // All optional, so linking to /trips never has to name a scope.
  validateSearch: (
    search: Record<string, unknown>,
  ): { scope?: TripTab; selected?: number; edit?: boolean; new?: boolean } => ({
    scope: search.scope === "discover" ? "discover" : undefined,
    // Which trip the desktop detail pane shows; keeps it linkable.
    selected: search.selected != null ? Number(search.selected) : undefined,
    edit: search.edit === true || search.edit === "true" ? true : undefined,
    new: search.new === true || search.new === "true" ? true : undefined,
  }),
  component: TripsPage,
});

function TripsPage() {
  const navigate = useNavigate({ from: "/trips/" });
  const { scope = "mine", selected, edit, new: creating } = Route.useSearch();
  const { isAuthenticated, isLoading: sessionLoading } = useSession();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));

  const filters: TripFilters = scope === "mine" ? { scope: "member" } : {};
  const { data, isLoading } = useTrips(filters, isAuthenticated);
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
      <Tabs
        value={scope}
        onChange={(_, v: TripTab) =>
          navigate({
            search: (prev) => ({
              ...prev,
              scope: v === "mine" ? undefined : v,
              selected: undefined,
            }),
          })
        }
        variant="fullWidth"
        sx={{ borderBottom: "1px solid", borderColor: "divider" }}
      >
        {TABS.map((t) => (
          <Tab key={t.value} value={t.value} label={t.label} />
        ))}
      </Tabs>

      {isLoading ? (
        <LoadingBox size={40} pt={6} />
      ) : trips.length === 0 ? (
        <EmptyState
          icon={
            <LuggageOutlinedIcon
              sx={{ fontSize: 48, color: "text.disabled" }}
            />
          }
          title={
            scope === "mine" ? "No trips yet." : "No trips shared with you yet."
          }
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
      <Box sx={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
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
