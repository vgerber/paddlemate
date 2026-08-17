import HistoryIcon from "@mui/icons-material/History";
import List from "@mui/material/List";
import type { RecentWaterway } from "@/lib/recentWaterways";
import ListGroupHeader from "./ListGroupHeader";
import RiverRow from "./RiverRow";

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
      <ListGroupHeader
        icon={<HistoryIcon sx={{ fontSize: 14 }} />}
        label="Recent rivers"
      />
      <List dense disablePadding>
        {rivers.map((river) => (
          <RiverRow
            key={river.id}
            name={river.name}
            onClick={() => onSelect(river.id)}
          />
        ))}
      </List>
    </>
  );
}
