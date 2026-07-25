import DirectionsBoatOutlinedIcon from "@mui/icons-material/DirectionsBoatOutlined";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import { useMemo } from "react";
import DescentCard from "@/components/descents/DescentCard";
import { useMyDescents } from "@/lib/hooks/useDescents";

/** The signed-in user's own descents, grouped by month. */
export default function MyLogsPanel({
  onOpen,
}: {
  onOpen: (id: number) => void;
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
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    }
    return Array.from(map.entries());
  }, [descents]);

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", pt: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (descents.length === 0) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 1.5,
          pt: 8,
          color: "text.disabled",
        }}
      >
        <DirectionsBoatOutlinedIcon sx={{ fontSize: 48 }} />
        <Typography variant="body2">No descents logged yet.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {groups.map(([label, items]) => (
        <Box key={label}>
          <Typography
            variant="caption"
            sx={{
              px: 0,
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
          <Box sx={{ border: "1px solid", borderColor: "divider" }}>
            {items.map((d) => (
              <DescentCard
                key={d.id}
                descent={d}
                onClick={() => onOpen(d.id)}
              />
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
