import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import ChartControls from "@/components/charts/ChartControls";
import {
  type TimeRange,
  useChartTimeRange,
} from "@/components/charts/water/types";
import WaterChart from "@/components/charts/water/WaterChart";
import { useSession } from "@/lib/hooks/useSession";
import { useStandingDescent } from "@/lib/hooks/useStandingDescent";
import { useWaterStatus } from "@/lib/hooks/useWaterways";

interface SectionChartPanelProps {
  waterwayId: number;
  sectionId: number;
  sectionName?: string;
}

export default function SectionChartPanel({
  waterwayId,
  sectionId,
  sectionName,
}: SectionChartPanelProps) {
  const { isAuthenticated } = useSession();
  const navigate = useNavigate();
  const { current: standingDescent, start: startDescent } =
    useStandingDescent();
  const { data: waterStatus, isLoading } = useWaterStatus(
    waterwayId,
    sectionId,
  );
  const [timeRange, setTimeRange] = useChartTimeRange();
  const [measurementType, setMeasurementType] = useState<string | null>(null);

  const measurementTypes = useMemo(() => {
    const types = new Set(
      (waterStatus?.ranges ?? []).map((r) => r.series.measurement_type),
    );
    return Array.from(types) as ("water_level" | "discharge" | "temperature")[];
  }, [waterStatus?.ranges]);

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
        {isAuthenticated && (
          <Box
            sx={{
              display: { xs: "none", sm: "flex" },
              alignItems: "center",
              gap: 1,
              flexShrink: 0,
            }}
          >
            {!standingDescent ? (
              <Button
                size="small"
                variant="outlined"
                color="success"
                sx={{
                  borderRadius: 0,
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  flexShrink: 0,
                }}
                onClick={() =>
                  startDescent({
                    startTime: new Date().toISOString(),
                    waterwayId,
                    sectionId,
                    sectionName: sectionName ?? "",
                  })
                }
              >
                Start
              </Button>
            ) : null}
            {!standingDescent && (
              <Button
                size="small"
                variant="contained"
                color="secondary"
                sx={{
                  borderRadius: 0,
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  flexShrink: 0,
                  px: 1.5,
                }}
                onClick={() =>
                  navigate({
                    to: "/logs/new",
                    search: { waterwayId, sectionId, startTime: undefined },
                  })
                }
              >
                Log descent
              </Button>
            )}
          </Box>
        )}
        <ChartControls
          measurementTypes={measurementTypes}
          measurementType={measurementType ?? measurementTypes[0]}
          onMeasurementTypeChange={setMeasurementType}
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
        />
      </Box>
      <Divider sx={{ mb: 1, flexShrink: 0 }} />
      {isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
          <CircularProgress size={22} />
        </Box>
      ) : (
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <WaterChart
            ranges={waterStatus?.ranges ?? []}
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
            measurementType={measurementType}
            onMeasurementTypeChange={setMeasurementType}
          />
        </Box>
      )}
    </Box>
  );
}
