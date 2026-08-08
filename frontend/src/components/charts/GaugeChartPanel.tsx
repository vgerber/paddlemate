import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import { useMemo } from "react";
import ChartControls from "@/components/charts/ChartControls";
import ChartPanelShell, {
  useChartPanelState,
  useMeasurementTypes,
} from "@/components/charts/ChartPanelShell";
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
  const { timeRange, setTimeRange, measurementType, setMeasurementType } =
    useChartPanelState();
  const measurementTypes = useMeasurementTypes(ranges);

  const subtitle = useMemo(() => {
    const r = ranges[0];
    if (!r) return null;
    const lbl = r.series.label ?? r.gauge.name;
    return `${lbl} (${r.series.unit})`;
  }, [ranges]);

  return (
    <ChartPanelShell
      footer={<GaugeAttribution source={ranges[0]?.source} />}
      header={
        <>
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
        </>
      }
    >
      <WaterChart
        ranges={ranges}
        showThresholds={false}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        measurementType={measurementType}
        onMeasurementTypeChange={setMeasurementType}
      />
    </ChartPanelShell>
  );
}
