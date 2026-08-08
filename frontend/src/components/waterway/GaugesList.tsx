import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import GaugeAttribution from "@/components/GaugeAttribution";
import type { WaterRangeWithStatus } from "@/lib/api";
import { formatReading } from "@/lib/format";

interface GaugesListProps {
  gaugeRanges: WaterRangeWithStatus[];
  selectedGaugeId?: number | null;
  onGaugeSelect?: (id: number) => void;
}

/** The river's gauges, each credited to the authority that publishes it. */
export default function GaugesList({
  gaugeRanges,
  selectedGaugeId,
  onGaugeSelect,
}: GaugesListProps) {
  if (gaugeRanges.length === 0) {
    return (
      <Typography color="text.secondary" variant="body2" sx={{ p: 1 }}>
        No gauges found.
      </Typography>
    );
  }
  return (
    <List dense disablePadding>
      {gaugeRanges.map((range) => (
        <ListItemButton
          key={range.gauge.id}
          selected={selectedGaugeId === range.gauge.id}
          onClick={() => onGaugeSelect?.(range.gauge.id)}
          sx={{ py: 0.75, px: 1.5, alignItems: "flex-start" }}
        >
          <ListItemText
            primary={(range.series.label ?? range.gauge.name).replace(
              /\s*\([WQ]\)\s*$/,
              "",
            )}
            secondary={
              <>
                {range.gauge.name}
                <GaugeAttribution source={range.source} />
              </>
            }
            slotProps={{
              primary: { variant: "body2" },
              // The attribution is a block element, so the secondary slot has
              // to be a div rather than the default p.
              secondary: { variant: "caption", component: "div" },
            }}
          />
          {range.latest_reading != null && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mr: 1, whiteSpace: "nowrap" }}
            >
              {formatReading(range.latest_reading.value, range.series.unit)}
            </Typography>
          )}
        </ListItemButton>
      ))}
    </List>
  );
}
