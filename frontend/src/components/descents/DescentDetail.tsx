import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import WaterwayMap from "@/components/map/Map";
import type { Descent, SectionWithFeatures } from "@/lib/api";
import { toPseudoSection, uniqueSnapshotsBySeries } from "@/lib/descents";
import {
  durationLabel,
  formatDate,
  formatReading,
  formatTime,
} from "@/lib/format";
import { EMPTY_MAP_SEARCH } from "@/lib/mapSearch";
import { fonts, labelSx } from "@/lib/theme";
import { levelConfig } from "@/lib/waterLevel";

const formatDateWithWeekday = (iso: string) =>
  formatDate(iso, { weekday: true });

const factLabelSx = {
  ...labelSx,
  fontSize: "0.6rem",
  letterSpacing: "0.1em",
  color: "text.disabled",
} as const;

const valueSx = {
  fontFamily: fonts.label,
  fontSize: "0.8rem",
} as const;

function Fact({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption?: string;
}) {
  return (
    <Box>
      <Typography sx={factLabelSx}>{label}</Typography>
      <Typography sx={valueSx}>{value}</Typography>
      {caption && (
        <Typography
          sx={{ ...factLabelSx, textTransform: "none", letterSpacing: 0 }}
        >
          {caption}
        </Typography>
      )}
    </Box>
  );
}

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
      {/* Trip facts */}
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
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
            border: "1px solid",
            borderColor: "divider",
            position: "relative",
          }}
        >
          <WaterwayMap
            sections={mapSections}
            putIn={
              descent.put_in_lat != null && descent.put_in_lon != null
                ? { lat: descent.put_in_lat, lon: descent.put_in_lon }
                : null
            }
            takeOut={
              descent.take_out_lat != null && descent.take_out_lon != null
                ? { lat: descent.take_out_lat, lon: descent.take_out_lon }
                : null
            }
          />
        </Box>
      )}

      {/* Sections in paddled order */}
      {sections.length > 0 && (
        <Box>
          <Typography sx={{ ...factLabelSx, mb: 1 }}>
            Sections ({sections.length})
          </Typography>
          <Box sx={{ border: "1px solid", borderColor: "divider" }}>
            {sections.map((s, index) => (
              <Box
                key={s.section_id}
                onClick={
                  s.waterway_id != null
                    ? () =>
                        navigate({
                          to: "/",
                          // Fresh map search state - only the target section.
                          search: {
                            ...EMPTY_MAP_SEARCH,
                            waterway: s.waterway_id ?? undefined,
                            section: s.section_id,
                          },
                        })
                    : undefined
                }
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 0.5,
                  p: 1.5,
                  borderBottom: index < sections.length - 1 ? "1px solid" : 0,
                  borderColor: "divider",
                  // Rows with a known waterway link back to the section pane.
                  ...(s.waterway_id != null && {
                    cursor: "pointer",
                    "&:hover": { bgcolor: "action.hover" },
                  }),
                }}
              >
                <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
                  <Typography
                    sx={{
                      ...valueSx,
                      color: "text.disabled",
                      fontSize: "0.7rem",
                    }}
                  >
                    {index + 1}
                  </Typography>
                  <Typography sx={{ ...valueSx, fontWeight: 700 }}>
                    {s.section_name ?? `Section #${s.section_id}`}
                  </Typography>
                  {s.waterway_name && (
                    <Typography
                      sx={{ fontSize: "0.7rem", color: "text.secondary" }}
                    >
                      {s.waterway_name}
                    </Typography>
                  )}
                </Box>
                {s.note && (
                  <Typography
                    sx={{
                      fontSize: "0.75rem",
                      color: "text.secondary",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {s.note}
                  </Typography>
                )}
                {uniqueSnapshotsBySeries(s.water_snapshots ?? []).length >
                  0 && (
                  <Box
                    sx={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 0.75,
                      mt: 0.25,
                    }}
                  >
                    {uniqueSnapshotsBySeries(s.water_snapshots ?? []).map(
                      (snap) => {
                        const cfg = levelConfig[snap.level];
                        return (
                          <Box
                            key={snap.series_id}
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 0.75,
                            }}
                          >
                            <Chip
                              size="small"
                              variant={
                                snap.level === "empty" ? "outlined" : "filled"
                              }
                              label={
                                snap.value != null
                                  ? formatReading(snap.value, snap.unit)
                                  : cfg.label
                              }
                              sx={{
                                fontSize: "0.65rem",
                                height: 20,
                                minWidth: 32,
                                color: cfg.color,
                                bgcolor: cfg.bgcolor,
                                borderColor:
                                  "border" in cfg ? cfg.border : undefined,
                              }}
                            />
                            <Typography
                              sx={{
                                fontSize: "0.7rem",
                                color: "text.disabled",
                              }}
                            >
                              {snap.gauge_name}
                            </Typography>
                          </Box>
                        );
                      },
                    )}
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* Trip note */}
      {descent.note && (
        <Box>
          <Typography sx={{ ...factLabelSx, mb: 0.5 }}>Note</Typography>
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
            {descent.note}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
