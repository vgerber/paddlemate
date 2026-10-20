import AddIcon from "@mui/icons-material/Add";
import LuggageOutlinedIcon from "@mui/icons-material/LuggageOutlined";
import Box from "@mui/material/Box";
import Fab from "@mui/material/Fab";
import useMediaQuery from "@mui/material/useMediaQuery";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import ListPaneHeader from "@/components/ListPaneHeader";
import { fabSx } from "@/components/PaneFab";
import LoadingBox from "@/components/states/LoadingBox";
import QueryStates from "@/components/states/QueryStates";
import SignInGate from "@/components/states/SignInGate";
import TripRow from "@/components/trips/TripRow";
import TripsCanvas from "@/components/trips/TripsCanvas";
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
  const tripsQuery = useTrips({}, isAuthenticated);
  const { data, isLoading } = tripsQuery;
  const selectedQuery = useTrip(isDesktop ? (selected ?? null) : null);
  const selectedTrip = selectedQuery.data;
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
    <QueryStates
      query={tripsQuery}
      count={trips.length}
      errorFallback="Could not load your trips."
      loadingSize={40}
      py={8}
      empty={{
        icon: <LuggageOutlinedIcon />,
        title: "No trips yet.",
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: { xs: 1, md: 0 },
          p: { xs: 1.5, md: 0 },
        }}
      >
        {trips.map((t) => (
          <TripRow
            key={t.id}
            trip={t}
            selected={isDesktop && t.id === selected}
            onSelect={() => openTrip(t.id)}
          />
        ))}
      </Box>
    </QueryStates>
  );

  if (!isDesktop) {
    return (
      <>
        <Box sx={{ maxWidth: 720, mx: "auto" }}>
          <ListPaneHeader count={trips.length} loading={isLoading} />
          {list}
        </Box>
        <Fab
          color="primary"
          onClick={() => navigate({ to: "/trips/new" })}
          aria-label="New trip"
          sx={fabSx}
        >
          <AddIcon />
        </Fab>
      </>
    );
  }

  // Desktop: the trip list and the open trip float over the map, which
  // draws the trip's bases and watch lists.
  const closeTrip = () =>
    navigate({
      search: (prev) => ({
        ...prev,
        selected: undefined,
        edit: undefined,
        new: undefined,
      }),
    });

  return (
    <TripsCanvas
      list={list}
      count={trips.length}
      loading={isLoading}
      trip={selectedTrip ?? null}
      opening={selected != null ? selectedQuery : undefined}
      creating={creating === true}
      editing={edit === true}
      onNew={() =>
        navigate({
          search: (prev) => ({ ...prev, new: true, selected: undefined }),
        })
      }
      onEditingChange={(v) =>
        navigate({ search: (prev) => ({ ...prev, edit: v || undefined }) })
      }
      onClose={closeTrip}
      onSaved={(id) =>
        navigate({
          search: (prev) => ({ ...prev, new: undefined, selected: id }),
        })
      }
    />
  );
}
