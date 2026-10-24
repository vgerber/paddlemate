import List from "@mui/material/List";
import { useMemo } from "react";
import LevelDots from "@/components/LevelDots";
import SectionHeading from "@/components/SectionHeading";
import { useSectionDotLevels } from "@/lib/hooks/useWaterStatus";
import { useWaterway } from "@/lib/hooks/useWaterways";
import type { RecentWaterway } from "@/lib/recentWaterways";
import RiverRow from "./RiverRow";

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
      <SectionHeading inset>Recent rivers</SectionHeading>
      <List dense disablePadding>
        {rivers.map((river) => (
          <RiverRow
            key={river.id}
            testId="recent-river"
            name={river.name}
            onClick={() => onSelect(river.id)}
            trailing={<RiverDots waterwayId={river.id} />}
          />
        ))}
      </List>
    </>
  );
}
