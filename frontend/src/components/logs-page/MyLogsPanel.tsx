import Box from "@mui/material/Box";
import { useMemo } from "react";
import DescentCard from "@/components/descents/DescentCard";
import QueryStates from "@/components/states/QueryStates";
import { useMyDescents } from "@/lib/hooks/useDescents";
import { LogIcon } from "@/lib/icons";
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
  const query = useMyDescents({});
  const data = query.data;
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

  return (
    <QueryStates
      query={query}
      count={descents.length}
      empty={{
        icon: <LogIcon />,
        title: "No descents logged yet.",
      }}
      errorFallback="Could not load your logs."
      loadingSize={40}
      py={8}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: { xs: 2, md: 0 },
        }}
      >
        {groups.map(([label, items]) => (
          <Box
            key={label}
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: { xs: 0.75, md: 0 },
            }}
          >
            <GroupHead testId="log-month">{label}</GroupHead>
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                gap: { xs: 1, md: 0 },
              }}
            >
              {items.map((d) => (
                <DescentCard
                  key={d.id}
                  descent={d}
                  selected={d.id === selectedId}
                  flatFromMd
                  onClick={() => onOpen(d.id)}
                />
              ))}
            </Box>
          </Box>
        ))}
      </Box>
    </QueryStates>
  );
}
