import Box from "@mui/material/Box";
import {
  activeMeasurementType,
  readingPerType,
} from "@/components/charts/water/series";
import Fact from "@/components/Fact";
import { LevelPill } from "@/components/WaterLevelChip";
import { formatReading, formatTime } from "@/lib/format";
import { useWaterStatus } from "@/lib/hooks/useWaterStatus";
import { theme } from "@/lib/theme";
import { isCalibrated, levelConfig } from "@/lib/waterLevel";

const { tokens } = theme;

const num = (n: number) => Number(n.toFixed(1));

/** The section's level at a glance, above its features on a desktop card:
 * the reading and its level, when it was taken, and the thresholds the level
 * is judged by. Nothing when no gauge is attached to the section. */
export default function SectionFacts({
  waterwayId,
  sectionId,
  preferredFeatureId,
}: {
  waterwayId: number;
  sectionId: number;
  preferredFeatureId?: number | null;
}) {
  const { data } = useWaterStatus(waterwayId, sectionId);
  const ranges = data?.ranges ?? [];
  const type = activeMeasurementType(ranges);
  const range = readingPerType(ranges, preferredFeatureId).find(
    (r) => r.type === type,
  )?.range;
  const latest = range?.latest_reading;
  if (!range) return null;

  const thresholds = [
    ["L", range.range_low],
    ["M", range.range_medium],
    ["H", range.range_high],
  ].flatMap(([k, v]) => (typeof v === "number" ? [`${k} ${num(v)}`] : []));

  return (
    <Box
      data-testid="section-facts"
      sx={{
        display: { xs: "none", md: "flex" },
        flexWrap: "wrap",
        columnGap: 3.5,
        rowGap: 1,
        px: 2,
        py: 1.75,
        bgcolor: tokens.surface,
        borderBottom: `1px solid ${tokens.outlineVariant}`,
      }}
    >
      <Fact
        label="Level now"
        value={
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            {latest ? formatReading(latest.value, range.series.unit) : "\u2013"}
            {latest && isCalibrated(range) && (
              <LevelPill level={range.level}>
                {levelConfig[range.level].label}
              </LevelPill>
            )}
          </Box>
        }
      />
      {latest && <Fact label="At" value={formatTime(latest.measured_at)} />}
      {thresholds.length > 0 && (
        <Fact label="Thresholds" value={thresholds.join(" · ")} />
      )}
    </Box>
  );
}
