import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import { useMemo } from "react";
import LevelDots from "@/components/LevelDots";
import { useSectionDotLevels } from "@/lib/hooks/useWaterStatus";
import { useWaterway } from "@/lib/hooks/useWaterways";
import type { RecentWaterway } from "@/lib/recentWaterways";
import ListGroupHeader from "./ListGroupHeader";
import { listRowSx } from "./RiverRow";

interface RecentRiverListProps {
  rivers: RecentWaterway[];
  onSelect: (id: number) => void;
}

/** A dot per section of the river. Its detail and the statuses are the ones
 * the map page loads, so a river seen before costs no request; one row asks
 * for its own sections only, and the shared queue keeps the burst bounded. */
function RiverDots({ waterwayId }: { waterwayId: number }) {
  const { data } = useWaterway(waterwayId);
  const sections = useMemo(() => data?.sections ?? [], [data]);
  const pairs = useMemo(
    () => sections.map((s) => ({ waterwayId, sectionId: s.id })),
    [sections, waterwayId],
  );
  const levels = useSectionDotLevels(pairs);
  const names = useMemo(
    () => sections.map((s) => s.name ?? "Section"),
    [sections],
  );
  return <LevelDots levels={levels} names={names} />;
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
            sx={{ ...listRowSx, gap: 1 }}
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
            <RiverDots waterwayId={river.id} />
          </ListItemButton>
        ))}
      </List>
    </>
  );
}
