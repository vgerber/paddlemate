import DirectionsBoatOutlinedIcon from "@mui/icons-material/DirectionsBoatOutlined";
import Box from "@mui/material/Box";
import { useMemo } from "react";
import DescentCard from "@/components/descents/DescentCard";
import EmptyState from "@/components/states/EmptyState";
import LoadingBox from "@/components/states/LoadingBox";
import { useMyDescents } from "@/lib/hooks/useDescents";
import GroupHead from "./GroupHead";

/** The signed-in user's own descents, grouped by month. */
export default function MyLogsPanel({
  onOpen,
  selectedId,
}: {
  onOpen: (id: number) => void;
  /** The log the desktop detail pane is showing. */
  selectedId?: number;
}) {
  const { data, isLoading } = useMyDescents({});
  const descents = data?.items ?? [];

  const groups = useMemo(() => {
    const map = new Map<string, (typeof descents)[0][]>();
    for (const d of descents) {
      const key = new Date(d.start_time).toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
      });
      const group = map.get(key);
      if (group) group.push(d);
      else map.set(key, [d]);
    }
    return Array.from(map.entries());
  }, [descents]);

  if (isLoading) {
    return <LoadingBox size={40} pt={6} />;
  }

  if (descents.length === 0) {
    return (
      <EmptyState
        icon={<DirectionsBoatOutlinedIcon />}
        title="No descents logged yet."
        py={8}
      />
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {groups.map(([label, items]) => (
        <Box
          key={label}
          sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}
        >
          <GroupHead testId="log-month">{label}</GroupHead>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {items.map((d) => (
              <DescentCard
                key={d.id}
                descent={d}
                selected={d.id === selectedId}
                onClick={() => onOpen(d.id)}
              />
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
