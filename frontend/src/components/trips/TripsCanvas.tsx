import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import {
  useCanvasLayout,
  useCanvasScene,
} from "@/components/canvas/CanvasContext";
import CanvasLayout from "@/components/canvas/CanvasLayout";
import FloatingCard from "@/components/canvas/FloatingCard";
import DockedAction from "@/components/DockedAction";
import ListPaneHeader from "@/components/ListPaneHeader";
import TripDetail from "@/components/trip-page/TripDetail";
import TripMembersCard from "@/components/trip-page/TripMembersCard";
import { useTripScene } from "@/components/trip-page/useTripScene";
import type { Trip } from "@/lib/api";
import { dateRange } from "@/lib/format";
import { labelSx, theme } from "@/lib/theme";
import TripForm from "./TripForm";

const { tokens } = theme;

/** From this window width the members get a card of their own. */
export const MEMBERS_CARD_FROM = 1600;

interface Props {
  /** The list body (rows, loading or empty state). */
  list: ReactNode;
  count: number;
  loading: boolean;
  trip: Trip | null;
  creating: boolean;
  editing: boolean;
  onNew: () => void;
  onEditingChange: (editing: boolean) => void;
  /** Leave the open trip or the new-trip form. */
  onClose: () => void;
  onSaved: (id: number) => void;
}

function CardTitle({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  return (
    <Box
      sx={{
        pl: 2,
        pr: 0.5,
        minHeight: 56,
        display: "flex",
        alignItems: "center",
        gap: 1,
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          component="h2"
          noWrap
          sx={{ fontWeight: 600, fontSize: "1rem", lineHeight: 1.3 }}
        >
          {title}
        </Typography>
        {subtitle && (
          <Typography
            noWrap
            sx={{ ...labelSx, color: tokens.onSurfaceVariant }}
          >
            {subtitle}
          </Typography>
        )}
      </Box>
      <IconButton
        aria-label="Close"
        onClick={onClose}
        sx={{ width: tokens.touch.min, height: tokens.touch.min }}
      >
        <CloseIcon />
      </IconButton>
    </Box>
  );
}

/** The trips screen on the canvas: the list at the left, the open trip beside
 * it, and from 1600 wide the members in a card of their own at the right.
 * The map behind draws the trip's bases and watch lists. */
export default function TripsCanvas({
  list,
  count,
  loading,
  trip,
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
      <FloatingCard
        id="list"
        side="left"
        kind="list"
        screen="trips"
        header={
          <Box sx={{ minHeight: 56, display: "flex", alignItems: "center" }}>
            <ListPaneHeader count={count} loading={loading} />
          </Box>
        }
      >
        <Box
          sx={{
            height: "100%",
            display: "flex",
            flexDirection: "column",
            bgcolor: tokens.surfaceLow,
          }}
        >
          <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>{list}</Box>
          <DockedAction label="New trip" onClick={onNew} />
        </Box>
      </FloatingCard>

      {creating && (
        <FloatingCard
          id="trip"
          side="left"
          kind="side"
          screen="trips"
          header={<CardTitle title="New trip" onClose={onClose} />}
        >
          <Box
            data-testid="trip-panel"
            sx={{ height: "100%", display: "flex", flexDirection: "column" }}
          >
            <TripForm embedded onSave={onSaved} onCancel={onClose} />
          </Box>
        </FloatingCard>
      )}

      {!creating && trip && (
        <FloatingCard
          id="trip"
          side="left"
          kind="side"
          screen="trips"
          header={
            <CardTitle
              title={trip.name}
              subtitle={dateRange(trip.start_date, trip.end_date)}
              onClose={onClose}
            />
          }
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
          header={
            <Box
              sx={{
                px: 2,
                minHeight: 56,
                display: "flex",
                alignItems: "center",
              }}
            >
              <Typography
                component="h2"
                sx={{ ...labelSx, color: tokens.onSurfaceVariant }}
              >
                Members
              </Typography>
            </Box>
          }
        >
          <TripMembersCard trip={trip} />
        </FloatingCard>
      )}
    </CanvasLayout>
  );
}
