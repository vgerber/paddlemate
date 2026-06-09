import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  TIME_RANGE_OPTIONS,
  type TimeRange,
  useChartTimeRange,
  typeLabel,
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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
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
        {measurementTypes.length > 1 &&
          (isMobile ? (
            <FormControl size="small" sx={{ flexShrink: 0 }}>
              <Select
                value={measurementType ?? measurementTypes[0]}
                onChange={(e) => setMeasurementType(e.target.value)}
                sx={{ fontSize: "0.75rem" }}
              >
                {measurementTypes.map((t) => (
                  <MenuItem key={t} value={t}>
                    {typeLabel(t)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : (
            <ToggleButtonGroup
              value={measurementType}
              exclusive
              size="small"
              onChange={(_, v) => v && setMeasurementType(v)}
              sx={{
                flexShrink: 0,
                "& .MuiToggleButton-root": {
                  py: 0.25,
                  px: 1,
                  fontSize: "0.7rem",
                },
              }}
            >
              {measurementTypes.map((t) => (
                <ToggleButton key={t} value={t}>
                  {typeLabel(t)}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          ))}
        {isMobile ? (
          <FormControl size="small" sx={{ flexShrink: 0 }}>
            <Select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as TimeRange)}
              sx={{ fontSize: "0.75rem" }}
            >
              {TIME_RANGE_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : (
          <ToggleButtonGroup
            value={timeRange}
            exclusive
            size="small"
            onChange={(_, v) => v && setTimeRange(v)}
            sx={{
              flexShrink: 0,
              "& .MuiToggleButton-root": {
                py: 0.25,
                px: 1,
                fontSize: "0.7rem",
              },
            }}
          >
            {TIME_RANGE_OPTIONS.map((o) => (
              <ToggleButton key={o.value} value={o.value}>
                {o.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        )}
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
