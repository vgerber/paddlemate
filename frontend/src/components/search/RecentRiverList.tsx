import HistoryIcon from "@mui/icons-material/History";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import type { RecentWaterway } from "@/lib/recentWaterways";

interface RecentRiverListProps {
  rivers: RecentWaterway[];
  onSelect: (id: number) => void;
}

/** Recently opened rivers (from localStorage), shown in the search panel
 * when no search criteria are set. Rows mirror the RiverList style. */
export default function RecentRiverList({
  rivers,
  onSelect,
}: RecentRiverListProps) {
  if (rivers.length === 0) return null;

  return (
    <>
      <Typography
        variant="overline"
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          color: "text.secondary",
          lineHeight: 1,
          px: 1,
          pt: 1,
          pb: 0.5,
        }}
      >
        <HistoryIcon sx={{ fontSize: 14 }} /> Recent rivers
      </Typography>
      <List dense disablePadding>
        {rivers.map((river) => (
          <ListItemButton
            key={river.id}
            onClick={() => onSelect(river.id)}
            sx={{ borderRadius: 1, mb: 0.5 }}
          >
            <ListItemText
              primary={river.name}
              slotProps={{
                primary: { variant: "body2", sx: { fontWeight: 600 } },
              }}
            />
          </ListItemButton>
        ))}
      </List>
    </>
  );
}
