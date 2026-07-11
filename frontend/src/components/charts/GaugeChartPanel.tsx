import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import { useMemo, useState } from "react";
import ChartControls from "@/components/charts/ChartControls";
import { useChartTimeRange } from "@/components/charts/water/types";
import WaterChart from "@/components/charts/water/WaterChart";
import GaugeAttribution from "@/components/GaugeAttribution";
import type { WaterRangeWithStatus } from "@/lib/api";

interface GaugeChartPanelProps {
  ranges: WaterRangeWithStatus[];
  onClose: () => void;
}

export default function GaugeChartPanel({
  ranges,
  onClose,
}: GaugeChartPanelProps) {
  const gauge = ranges[0]?.gauge;
  const [timeRange, setTimeRange] = useChartTimeRange();
  const [measurementType, setMeasurementType] = useState<string | null>(null);

  const measurementTypes = useMemo(() => {
    const types = new Set(ranges.map((r) => r.series.measurement_type));
    return Array.from(types) as ("water_level" | "discharge" | "temperature")[];
  }, [ranges]);

  const subtitle = useMemo(() => {
    const r = ranges[0];
    if (!r) return null;
    const lbl = r.series.label ?? r.gauge.name;
    return `${lbl} (${r.series.unit})`;
  }, [ranges]);

  return (
    <Box
      sx={{
        borderTop: "1px solid",
        borderColor: "divider",
        height: 260,
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        p: 1.5,
        pb: 0.5,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: { xs: "center", md: "flex-start" },
          flexWrap: "wrap",
          mb: 1,
          flexShrink: 0,
          gap: 1,
        }}
      >
        <Typography
          variant="subtitle2"
          sx={{ fontWeight: 600, flex: 1, minWidth: 0 }}
          noWrap
        >
          {gauge?.name ?? "Gauge"}
          {subtitle && (
            <Box
              component="span"
              sx={{ fontWeight: 400, color: "text.secondary" }}
            >
              {" - "}
              {subtitle}
            </Box>
          )}
        </Typography>
        <ChartControls
          measurementTypes={measurementTypes}
          measurementType={measurementType ?? measurementTypes[0]}
          onMeasurementTypeChange={setMeasurementType}
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
        />
        <IconButton
          size="small"
          onClick={onClose}
          aria-label="Close gauge chart"
          sx={{ flexShrink: 0 }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      <Divider sx={{ mb: 1, flexShrink: 0 }} />
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <WaterChart
          ranges={ranges}
          showThresholds={false}
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          measurementType={measurementType}
          onMeasurementTypeChange={setMeasurementType}
        />
      </Box>
      <GaugeAttribution source={ranges[0]?.source} />
    </Box>
  );
}
