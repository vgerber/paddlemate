import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import { phoneRowPad } from "@/components/canvas/flatRow";
import GaugeAttribution from "@/components/GaugeAttribution";
import EmptyState from "@/components/states/EmptyState";
import type { WaterRangeWithStatus } from "@/lib/api";
import { formatReading } from "@/lib/format";
import { alphas, theme } from "@/lib/theme";

const { tokens } = theme;

interface GaugesListProps {
  gaugeRanges: WaterRangeWithStatus[];
  selectedGaugeId?: number | null;
  onGaugeSelect?: (id: number) => void;
}

/** The river's gauges, one card each: name, station, the credit to the
 * authority that publishes it, and the latest reading. */
export default function GaugesList({
  gaugeRanges,
  selectedGaugeId,
  onGaugeSelect,
}: GaugesListProps) {
  if (gaugeRanges.length === 0) {
    return <EmptyState title="No gauges found." py={4} />;
  }
  return (
    <Box
      sx={{ display: "grid", gap: 1.25, p: 1.5 }}
      role="list"
      aria-label="Gauges"
    >
      {gaugeRanges.map((range) => {
        const selected = selectedGaugeId === range.gauge.id;
        return (
          <ButtonBase
            key={range.gauge.id}
            role="listitem"
            data-testid="gauge-card"
            aria-current={selected || undefined}
            onClick={() => onGaugeSelect?.(range.gauge.id)}
            sx={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 1.5,
              width: "100%",
              minHeight: tokens.touch.row,
              px: 1.75,
              ...phoneRowPad,
              py: 1.25,
              textAlign: "left",
              bgcolor: selected
                ? `${tokens.primary}${alphas.wash}`
                : tokens.surface,
              borderRadius: `${tokens.radii.md}px`,
              boxShadow: selected
                ? `${tokens.elevation.e1}, inset 3px 0 0 ${tokens.primary}`
                : tokens.elevation.e1,
            }}
          >
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography
                sx={{
                  fontSize: "0.9375rem",
                  fontWeight: 600,
                  lineHeight: 1.35,
                }}
              >
                {(range.series.label ?? range.gauge.name).replace(
                  /\s*\([WQ]\)\s*$/,
                  "",
                )}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                {range.gauge.name}
              </Typography>
              <GaugeAttribution source={range.source} />
            </Box>
            {range.latest_reading != null && (
              <Typography
                sx={{
                  fontSize: "0.9375rem",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatReading(range.latest_reading.value, range.series.unit)}
              </Typography>
            )}
          </ButtonBase>
        );
      })}
    </Box>
  );
}
