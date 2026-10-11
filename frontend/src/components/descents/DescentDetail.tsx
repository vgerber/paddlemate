import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import Fact, { valueSx } from "@/components/Fact";
import WaterwayMap from "@/components/map/Map";
import { LevelPill } from "@/components/WaterLevelChip";
import type { Descent, SectionWithFeatures } from "@/lib/api";
import { toPseudoSection, uniqueSnapshotsBySeries } from "@/lib/descents";
import {
  durationLabel,
  formatDate,
  formatReading,
  formatTime,
} from "@/lib/format";
import { EMPTY_MAP_SEARCH } from "@/lib/mapSearch";
import { labelSx, theme } from "@/lib/theme";
import { levelConfig } from "@/lib/waterLevel";

const { tokens } = theme;

const formatDateWithWeekday = (iso: string) =>
  formatDate(iso, { weekday: true });

/** Full trip view for one descent: facts, route map, the sections in paddled
 * order with their notes and the water levels captured when it was logged. */
export default function DescentDetail({ descent }: { descent: Descent }) {
  const navigate = useNavigate();

  const sections = useMemo(
    () => [...descent.sections].sort((a, b) => a.sort_order - b.sort_order),
    [descent.sections],
  );

  // The section lines travel with the descent, so the route renders without
  // fetching each waterway.
  const mapSections = useMemo(
    () =>
      sections
        .filter(
          (s): s is typeof s & { location: SectionWithFeatures["location"] } =>
            s.location?.type === "LineString",
        )
        .map((s) =>
          toPseudoSection({
            id: s.section_id,
            name: s.section_name ?? `Section #${s.section_id}`,
            location: s.location,
          }),
        ),
    [sections],
  );

  const multiDay =
    descent.start_time.slice(0, 10) !== descent.end_time.slice(0, 10);
  const duration = durationLabel(descent.start_time, descent.end_time);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          columnGap: 4,
          rowGap: 1.5,
        }}
      >
        {multiDay ? (
          <>
            <Fact
              label="From"
              value={formatDateWithWeekday(descent.start_time)}
              caption={formatTime(descent.start_time)}
            />
            <Fact
              label="To"
              value={formatDateWithWeekday(descent.end_time)}
              caption={formatTime(descent.end_time)}
            />
            {duration && <Fact label="Duration" value={duration} />}
          </>
        ) : (
          <>
            <Fact
              label="Date"
              value={formatDateWithWeekday(descent.start_time)}
            />
            <Fact
              label="Time"
              value={duration ?? "-"}
              caption={`${formatTime(descent.start_time)} - ${formatTime(descent.end_time)}`}
            />
          </>
        )}
      </Box>

      {(descent.put_in_label || descent.take_out_label) && (
        <Box
          sx={{ display: "flex", flexWrap: "wrap", columnGap: 4, rowGap: 1.5 }}
        >
          {descent.put_in_label && (
            <Fact label="Put in" value={descent.put_in_label} />
          )}
          {descent.take_out_label && (
            <Fact label="Take out" value={descent.take_out_label} />
          )}
        </Box>
      )}

      {/* Route */}
      {(mapSections.length > 0 || descent.put_in_lat != null) && (
        <Box
          sx={{
            height: 260,
            borderRadius: `${tokens.radii.md}px`,
            overflow: "hidden",
            position: "relative",
          }}
        >
          <WaterwayMap
            sections={mapSections}
            picking={{
              putIn:
                descent.put_in_lat != null && descent.put_in_lon != null
                  ? { lat: descent.put_in_lat, lon: descent.put_in_lon }
                  : null,
              takeOut:
                descent.take_out_lat != null && descent.take_out_lon != null
                  ? { lat: descent.take_out_lat, lon: descent.take_out_lon }
                  : null,
            }}
          />
        </Box>
      )}

      {/* Sections in paddled order */}
      {sections.length > 0 && (
        <Box>
          <Typography sx={{ ...labelSx, fontSize: "0.875rem", mb: 1 }}>
            Sections ({sections.length})
          </Typography>
          <Box sx={{ display: "grid", gap: 1 }}>
            {sections.map((s, index) => {
              const open = () =>
                navigate({
                  to: "/",
                  // Fresh map search state - only the target section.
                  search: {
                    ...EMPTY_MAP_SEARCH,
                    waterway: s.waterway_id ?? undefined,
                    section: s.section_id,
                  },
                });
              const snaps = uniqueSnapshotsBySeries(s.water_snapshots ?? []);
              return (
                <ButtonBase
                  key={s.section_id}
                  data-testid="log-section"
                  component={s.waterway_id != null ? "button" : "div"}
                  onClick={s.waterway_id != null ? open : undefined}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "24px minmax(0, 1fr)",
                    columnGap: 1,
                    alignItems: "start",
                    textAlign: "left",
                    width: "100%",
                    boxSizing: "border-box",
                    minHeight: tokens.touch.min,
                    p: 1.5,
                    font: "inherit",
                    color: "text.primary",
                    bgcolor: tokens.surfaceHigh,
                    borderRadius: `${tokens.radii.md}px`,
                    boxShadow: "none",
                    cursor: s.waterway_id != null ? "pointer" : "default",
                  }}
                >
                  <Box
                    component="span"
                    sx={{
                      ...valueSx,
                      color: "text.secondary",
                      fontSize: "0.8125rem",
                    }}
                  >
                    {index + 1}
                  </Box>
                  <Box component="span" sx={{ display: "block", minWidth: 0 }}>
                    <Box component="span" sx={{ ...valueSx, fontWeight: 600 }}>
                      {s.section_name ?? `Section #${s.section_id}`}
                    </Box>{" "}
                    {s.waterway_name && (
                      <Box
                        component="span"
                        sx={{ fontSize: "0.8125rem", color: "text.secondary" }}
                      >
                        {s.waterway_name}
                      </Box>
                    )}
                    {s.note && (
                      <Box
                        component="span"
                        sx={{
                          display: "block",
                          mt: 0.5,
                          fontSize: "0.8125rem",
                          color: "text.secondary",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {s.note}
                      </Box>
                    )}
                    {snaps.map((snap) => (
                      <Box
                        key={snap.series_id}
                        component="span"
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: 1,
                          mt: 0.75,
                        }}
                      >
                        <LevelPill level={snap.level}>
                          {snap.value != null
                            ? formatReading(snap.value, snap.unit)
                            : levelConfig[snap.level].label}
                        </LevelPill>
                        <Box
                          component="span"
                          sx={{
                            fontSize: "0.8125rem",
                            color: "text.secondary",
                          }}
                        >
                          {snap.gauge_name}
                        </Box>
                      </Box>
                    ))}
                  </Box>
                </ButtonBase>
              );
            })}
          </Box>
        </Box>
      )}

      {/* Trip note */}
      {descent.note && (
        <Box>
          <Typography sx={{ ...labelSx, fontSize: "0.875rem", mb: 0.5 }}>
            Note
          </Typography>
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
            {descent.note}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
