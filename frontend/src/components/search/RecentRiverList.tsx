import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import type { RecentWaterway } from "@/lib/recentWaterways";
import ListGroupHeader from "./ListGroupHeader";
import { cardRowSx } from "./RiverRow";

interface RecentRiverListProps {
  rivers: RecentWaterway[];
  onSelect: (id: number) => void;
}

/** Recently opened rivers (from localStorage), shown in the search panel
 * when no search criteria are set. Each is a card: the name, and what it is. */
export default function RecentRiverList({
  rivers,
  onSelect,
}: RecentRiverListProps) {
  if (rivers.length === 0) return null;

  return (
    <>
      <ListGroupHeader label="Recent rivers" />
      <List dense disablePadding>
        {rivers.map((river) => (
          <ListItemButton
            key={river.id}
            data-testid="recent-river"
            onClick={() => onSelect(river.id)}
            sx={{ ...cardRowSx, mb: 0.75 }}
          >
            <ListItemText
              primary={river.name}
              secondary="river"
              sx={{ my: 0, minWidth: 0 }}
              slotProps={{
                primary: { variant: "body1", sx: { fontWeight: 500 } },
                secondary: { variant: "body2", color: "textSecondary" },
              }}
            />
          </ListItemButton>
        ))}
      </List>
    </>
  );
}
