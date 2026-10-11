import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import ChartCard from "@/components/charts/ChartCard";
import { useChartPanelState } from "@/components/charts/chartState";
import WaterChart from "@/components/charts/water/WaterChart";
import { GaugeAttributions } from "@/components/GaugeAttribution";
import LoadingBox from "@/components/states/LoadingBox";
import { useSession } from "@/lib/hooks/useSession";
import { useStandingDescent } from "@/lib/hooks/useStandingDescent";
import { useWaterStatus } from "@/lib/hooks/useWaterStatus";
import { theme } from "@/lib/theme";

const { tokens } = theme;

interface SectionChartPanelProps {
  waterwayId: number;
  sectionId: number;
  sectionName?: string;
  /** Feature highlighted in the section's feature timeline - its water
   * ranges are brought to the front in the chart. */
  selectedFeatureId?: number | null;
  /** Name and type of that feature, shown as a chart caption. */
  selectedFeature?: { name: string; type: string } | null;
  /** Feature owning the section's default thresholds (whitewater). */
  preferredFeatureId?: number | null;
  /** Lets the chart grow taller (the features list is folded). */
  tall?: boolean;
}

export default function SectionChartPanel({
  waterwayId,
  sectionId,
  sectionName,
  selectedFeatureId,
  selectedFeature,
  preferredFeatureId,
  tall,
}: SectionChartPanelProps) {
  const { isAuthenticated } = useSession();
  const navigate = useNavigate();
  const { current: standingDescent, start: startDescent } =
    useStandingDescent();
  const { data: waterStatus, isLoading } = useWaterStatus(
    waterwayId,
    sectionId,
  );
  const { timeRange, setTimeRange, measurementType, setMeasurementType } =
    useChartPanelState();

  const ranges = useMemo(
    () => waterStatus?.ranges ?? [],
    [waterStatus?.ranges],
  );
  return (
    <>
      {isAuthenticated && !standingDescent && (
        <Box
          sx={{
            display: { xs: "none", sm: "flex" },
            alignItems: "center",
            gap: 1,
            px: 1.5,
            pt: 1.5,
          }}
        >
          <Button
            variant="outlined"
            sx={{ minHeight: tokens.touch.min }}
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
          <Button
            variant="contained"
            sx={{ minHeight: tokens.touch.min }}
            onClick={() =>
              navigate({
                to: "/logs/new",
                search: { waterwayId, sectionId, startTime: undefined },
              })
            }
          >
            Log descent
          </Button>
        </Box>
      )}
      <ChartCard
        ranges={ranges}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        measurementType={measurementType}
        onMeasurementTypeChange={setMeasurementType}
        preferredFeatureId={preferredFeatureId}
        tall={tall}
        footer={<GaugeAttributions sources={ranges.map((r) => r.source)} />}
      >
        {(headroom) =>
          isLoading ? (
            <LoadingBox size={22} py={6} />
          ) : (
            <WaterChart
              ranges={ranges}
              selectedFeatureId={selectedFeatureId}
              selectedFeature={selectedFeature}
              preferredFeatureId={preferredFeatureId}
              timeRange={timeRange}
              measurementType={measurementType}
              headroom={headroom}
            />
          )
        }
      </ChartCard>
    </>
  );
}
