import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import WaterChart from "@/components/WaterChart";
import type { WaterRangeWithStatus } from "@/lib/api";

interface GaugeChartPanelProps {
  ranges: WaterRangeWithStatus[];
  onClose: () => void;
}

export default function GaugeChartPanel({ ranges, onClose }: GaugeChartPanelProps) {
  const gauge = ranges[0]?.gauge;

  return (
    <Box
      sx={{
        borderTop: "1px solid",
        borderColor: "divider",
        height: 340,
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        p: 1.5,
        pb: 0.5,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "flex-start", mb: 1, flexShrink: 0 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }} noWrap>
            {gauge?.name ?? "Gauge"}
          </Typography>
          {gauge && (
            <Typography variant="caption" color="text.secondary">
              {gauge.provider}
            </Typography>
          )}
        </Box>
        <IconButton size="small" onClick={onClose} aria-label="Close gauge chart" sx={{ mt: -0.5 }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      <Divider sx={{ mb: 1, flexShrink: 0 }} />
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <WaterChart ranges={ranges} showThresholds={false} />
      </Box>
    </Box>
  );
}
