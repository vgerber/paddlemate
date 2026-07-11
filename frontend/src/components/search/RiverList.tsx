import AddIcon from "@mui/icons-material/Add";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";

interface Waterway {
  id: number;
  name: string;
  waterway_type: string;
}

interface PendingRiver {
  id: number;
  name: string;
}

interface RiverListProps {
  waterways: Waterway[];
  isLoading: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onSelect: (id: number) => void;
  onLoadMore: () => void;
  /** Own pending river proposals matching the search - shown as disabled entries. */
  pendingRivers?: PendingRiver[];
  /** Current name search term (used for the "add it" CTA). */
  searchName?: string;
  /** Opens the "suggest new river" flow; only rendered when search found nothing. */
  onProposeRiver?: () => void;
}

function PendingRiverItems({
  pendingRivers,
}: {
  pendingRivers: PendingRiver[];
}) {
  return (
    <>
      {pendingRivers.map((p) => (
        <ListItem
          key={`pending-${p.id}`}
          sx={{ borderRadius: 1, mb: 0.5, opacity: 0.6 }}
        >
          <ListItemText
            primary={p.name}
            slotProps={{
              primary: { variant: "body2", sx: { fontWeight: 600 } },
            }}
          />
          <Chip
            icon={<HourglassEmptyIcon sx={{ fontSize: "0.8rem !important" }} />}
            label="PENDING APPROVAL"
            color="warning"
            size="small"
            variant="outlined"
            sx={{ flexShrink: 0, fontSize: "0.65rem" }}
          />
        </ListItem>
      ))}
    </>
  );
}

export default function RiverList({
  waterways,
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  onSelect,
  onLoadMore,
  pendingRivers = [],
  searchName,
  onProposeRiver,
}: RiverListProps) {
  if (!isLoading && waterways.length === 0) {
    return (
      <>
        {pendingRivers.length > 0 && (
          <List dense disablePadding>
            <PendingRiverItems pendingRivers={pendingRivers} />
          </List>
        )}
        <Typography
          color="text.secondary"
          variant="body2"
          sx={{ textAlign: "center", py: pendingRivers.length > 0 ? 2 : 4 }}
        >
          No rivers found.
        </Typography>
        {onProposeRiver && searchName && (
          <Button
            onClick={onProposeRiver}
            variant="outlined"
            size="small"
            fullWidth
            startIcon={<AddIcon />}
          >
            Can't find your river? Add it
          </Button>
        )}
      </>
    );
  }

  return (
    <>
      <List dense disablePadding>
        <PendingRiverItems pendingRivers={pendingRivers} />
        {waterways.map((waterway) => (
          <ListItemButton
            key={waterway.id}
            onClick={() => onSelect(waterway.id)}
            sx={{ borderRadius: 1, mb: 0.5 }}
          >
            <ListItemText
              primary={waterway.name}
              slotProps={{
                primary: { variant: "body2", sx: { fontWeight: 600 } },
              }}
            />
            <Chip
              label={waterway.waterway_type.toUpperCase()}
              color="primary"
              size="small"
              variant="outlined"
              sx={{ flexShrink: 0, fontSize: "0.65rem" }}
            />
          </ListItemButton>
        ))}
      </List>
      {hasNextPage && (
        <Button
          onClick={onLoadMore}
          disabled={isFetchingNextPage}
          variant="outlined"
          size="small"
          fullWidth
          sx={{ mt: 1 }}
        >
          {isFetchingNextPage ? "Loading…" : "Load more"}
        </Button>
      )}
    </>
  );
}
