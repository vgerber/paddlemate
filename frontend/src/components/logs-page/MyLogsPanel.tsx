import DirectionsBoatOutlinedIcon from "@mui/icons-material/DirectionsBoatOutlined";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useMemo } from "react";
import DescentCard from "@/components/descents/DescentCard";
import EmptyState from "@/components/states/EmptyState";
import LoadingBox from "@/components/states/LoadingBox";
import { useMyDescents } from "@/lib/hooks/useDescents";

/** The signed-in user's own descents, grouped by month. */
export default function MyLogsPanel({
  onOpen,
  selectedId,
  flush,
}: {
  onOpen: (id: number) => void;
  /** The log the desktop detail pane is showing. */
  selectedId?: number;
  /** In the desktop list pane the column itself is the list, so the months
   * lose their boxes and the rows sit on the pane's own ground. */
  flush?: boolean;
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
        icon={
          <DirectionsBoatOutlinedIcon
            sx={{ fontSize: 48, color: "text.disabled" }}
          />
        }
        title="No descents logged yet."
        py={8}
      />
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {groups.map(([label, items]) => (
        <Box key={label}>
          <Typography
            variant="caption"
            sx={{
              px: flush ? 2 : 0,
              pb: 1,
              display: "block",
              color: "text.secondary",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {label}
          </Typography>
          <Box
            sx={{
              border: flush ? "none" : "1px solid",
              borderColor: "divider",
            }}
          >
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
