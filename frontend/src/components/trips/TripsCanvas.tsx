import Box from "@mui/material/Box";
import type { ReactNode } from "react";
import {
  useCanvasLayout,
  useCanvasScene,
} from "@/components/canvas/CanvasContext";
import CanvasLayout from "@/components/canvas/CanvasLayout";
import FloatingCard from "@/components/canvas/FloatingCard";
import DockedAction from "@/components/DockedAction";
import ListPaneHeader from "@/components/ListPaneHeader";
import ErrorState from "@/components/states/ErrorState";
import LoadingBox from "@/components/states/LoadingBox";
import TripDetail from "@/components/trip-page/TripDetail";
import TripMembersCard from "@/components/trip-page/TripMembersCard";
import { useTripScene } from "@/components/trip-page/useTripScene";
import type { Trip } from "@/lib/api";
import TripForm from "./TripForm";

/** From this window width the members get a card of their own. */
export const MEMBERS_CARD_FROM = 1600;

interface Props {
  /** The list body (rows, loading or empty state). */
  list: ReactNode;
  count: number;
  loading: boolean;
  trip: Trip | null;
  /** The open trip's own fetch, while there is no trip to show yet. */
  opening?: { isError: boolean; error: unknown; refetch: () => unknown };
  creating: boolean;
  editing: boolean;
  onNew: () => void;
  onEditingChange: (editing: boolean) => void;
  /** Leave the open trip or the new-trip form. */
  onClose: () => void;
  onSaved: (id: number) => void;
}

/** The trips screen on the canvas: the list at the left, the open trip beside
 * it, and from 1600 wide the members in a card of their own at the right.
 * The map behind draws the trip's bases and watch lists. */
export default function TripsCanvas({
  list,
  count,
  loading,
  trip,
  opening,
  creating,
  editing,
  onNew,
  onEditingChange,
  onClose,
  onSaved,
}: Props) {
  // Only mounted signed in on a wide screen, so the map never shows behind
  // the sign-in prompt.
  useCanvasScene(useTripScene(trip));
  const { windowWidth } = useCanvasLayout();
  const membersCard = trip != null && windowWidth >= MEMBERS_CARD_FROM;

  return (
    <CanvasLayout>
      {/* An open trip is the one card; its back arrow returns to the list. */}
      {(creating || (!trip && !opening)) && (
        <FloatingCard
          id="list"
          side="left"
          kind="list"
          screen="trips"
          title="Trips"
          selfHeaded
        >
          <Box
            sx={{
              height: "100%",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
              <ListPaneHeader count={count} loading={loading} />
              {list}
            </Box>
            <DockedAction label="New trip" onClick={onNew} />
          </Box>
        </FloatingCard>
      )}

      {creating && (
        <FloatingCard
          id="trip"
          side="left"
          kind="side"
          screen="trips"
          title="New trip"
          onClose={onClose}
        >
          <Box
            data-testid="trip-panel"
            sx={{ height: "100%", display: "flex", flexDirection: "column" }}
          >
            <TripForm embedded onSave={onSaved} onCancel={onClose} />
          </Box>
        </FloatingCard>
      )}

      {!creating && !trip && opening && (
        <FloatingCard
          id="trip"
          side="left"
          kind="side"
          screen="trips"
          title="Trip"
          onClose={onClose}
        >
          <Box data-testid="trip-panel">
            {opening.isError ? (
              <ErrorState
                error={opening.error}
                fallback="Could not load this trip."
                onRetry={() => opening.refetch()}
                py={8}
              />
            ) : (
              <LoadingBox size={40} pt={8} />
            )}
          </Box>
        </FloatingCard>
      )}

      {!creating && trip && (
        <FloatingCard
          id="trip"
          side="left"
          kind="side"
          screen="trips"
          title={trip.name}
          selfHeaded
        >
          <Box
            data-testid="trip-panel"
            sx={{ height: "100%", display: "flex", flexDirection: "column" }}
          >
            <TripDetail
              trip={trip}
              embedded
              canvasMap
              membersCard={membersCard}
              editing={editing}
              onEditingChange={onEditingChange}
              onClose={onClose}
              onDeleted={onClose}
            />
          </Box>
        </FloatingCard>
      )}

      {membersCard && !creating && trip && (
        <FloatingCard
          id="members"
          side="right"
          kind="side"
          // Folds before the list and the trip: the budget never fits all three.
          priority={0}
          screen="trips"
          title="Members"
        >
          <TripMembersCard trip={trip} />
        </FloatingCard>
      )}
    </CanvasLayout>
  );
}
