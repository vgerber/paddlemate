import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";

interface Waterway {
  id: number;
  name: string;
  waterway_type: string;
}

interface RiverListProps {
  waterways: Waterway[];
  isLoading: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onSelect: (id: number) => void;
  onLoadMore: () => void;
}

export default function RiverList({
  waterways,
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  onSelect,
  onLoadMore,
}: RiverListProps) {
  if (!isLoading && waterways.length === 0) {
    return (
      <Typography
        color="text.secondary"
        variant="body2"
        sx={{ textAlign: "center", py: 4 }}
      >
        No rivers found.
      </Typography>
    );
  }

  return (
    <>
      <List dense disablePadding>
        {waterways.map((waterway) => (
          <ListItemButton
            key={waterway.id}
            onClick={() => onSelect(waterway.id)}
            sx={{ borderRadius: 1, mb: 0.5 }}
          >
            <ListItemText
              primary={waterway.name}
              slotProps={{ primary: { variant: "body2", fontWeight: 600 } }}
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
