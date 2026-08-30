import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import ChartControls from "@/components/charts/ChartControls";
import ChartPanelShell, {
  useChartPanelState,
  useMeasurementTypes,
} from "@/components/charts/ChartPanelShell";
import WaterChart from "@/components/charts/water/WaterChart";
import { GaugeAttributions } from "@/components/GaugeAttribution";
import LoadingBox from "@/components/states/LoadingBox";
import { useMyDescents } from "@/lib/hooks/useDescents";
import { useSession } from "@/lib/hooks/useSession";
import { useStandingDescent } from "@/lib/hooks/useStandingDescent";
import { useWaterStatus } from "@/lib/hooks/useWaterStatus";

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
}

export default function SectionChartPanel({
  waterwayId,
  sectionId,
  sectionName,
  selectedFeatureId,
  selectedFeature,
  preferredFeatureId,
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

  // Own descents on this section, shown as shaded bands in the charts.
  const { data: myDescents } = useMyDescents(
    { section_id: sectionId, per_page: 100 },
    isAuthenticated,
  );
  const descentSpans = useMemo(
    () =>
      (myDescents?.items ?? []).map((d) => ({
        id: d.id,
        start: new Date(d.start_time).getTime(),
        end: new Date(d.end_time).getTime(),
        name:
          d.name ||
          new Date(d.start_time).toLocaleDateString(undefined, {
            day: "2-digit",
            month: "short",
            year: "numeric",
          }),
      })),
    [myDescents],
  );

  const ranges = useMemo(
    () => waterStatus?.ranges ?? [],
    [waterStatus?.ranges],
  );
  const measurementTypes = useMeasurementTypes(ranges);

  return (
    <ChartPanelShell
      footer={<GaugeAttributions sources={ranges.map((r) => r.source)} />}
      header={
        <>
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
                    fontSize: "0.75rem",
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
                    fontSize: "0.75rem",
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
        </>
      }
    >
      {isLoading ? (
        <LoadingBox size={22} py={3} />
      ) : (
        <WaterChart
          ranges={ranges}
          selectedFeatureId={selectedFeatureId}
          selectedFeature={selectedFeature}
          preferredFeatureId={preferredFeatureId}
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          measurementType={measurementType}
          onMeasurementTypeChange={setMeasurementType}
          descentSpans={descentSpans}
        />
      )}
    </ChartPanelShell>
  );
}
