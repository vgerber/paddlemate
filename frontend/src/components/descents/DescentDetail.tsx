import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import { useTheme } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import { useMemo } from "react";
import WaterwayMap from "@/components/map/Map";
import type {
  Descent,
  SectionWaterSnapshot,
  SectionWithFeatures,
} from "@/lib/api";

/** One snapshot per gauge series - older descents stored one per feature
 * range, which would repeat the same reading. */
export function uniqueSnapshotsBySeries(
  snaps: SectionWaterSnapshot[],
): SectionWaterSnapshot[] {
  return snaps.filter(
    (s, i) => snaps.findIndex((x) => x.series_id === s.series_id) === i,
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function durationLabel(start: string, end: string): string | null {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h === 0) return m > 0 ? `${m}m` : null;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const labelSx = {
  fontSize: "0.6rem",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: "text.disabled",
  fontFamily: '"Space Grotesk", monospace',
} as const;

const valueSx = {
  fontFamily: '"Space Grotesk", monospace',
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
      <Typography sx={labelSx}>{label}</Typography>
      <Typography sx={valueSx}>{value}</Typography>
      {caption && (
        <Typography
          sx={{ ...labelSx, textTransform: "none", letterSpacing: 0 }}
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
  const { tokens } = useTheme();
  const levelConfig = {
    empty: tokens.waterEmpty,
    low: tokens.waterLow,
    medium: tokens.waterMedium,
    high: tokens.waterHigh,
  };

  const sections = useMemo(
    () => [...descent.sections].sort((a, b) => a.sort_order - b.sort_order),
    [descent.sections],
  );

  // The section lines travel with the descent, so the route renders without
  // fetching each waterway. Same pseudo-section shape the form's map uses.
  const mapSections = useMemo(
    () =>
      sections
        .filter((s) => s.location?.type === "LineString")
        .map((s) => ({
          id: s.section_id,
          name: s.section_name ?? `Section #${s.section_id}`,
          waterway_id: 0,
          description: null,
          location: s.location,
          features: [],
          names: [],
          descriptions: [],
          created_at: "",
          updated_at: "",
        })) as SectionWithFeatures[],
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
              value={formatDate(descent.start_time)}
              caption={formatTime(descent.start_time)}
            />
            <Fact
              label="To"
              value={formatDate(descent.end_time)}
              caption={formatTime(descent.end_time)}
            />
            {duration && <Fact label="Duration" value={duration} />}
          </>
        ) : (
          <>
            <Fact label="Date" value={formatDate(descent.start_time)} />
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
          <Typography sx={{ ...labelSx, mb: 1 }}>
            Sections ({sections.length})
          </Typography>
          <Box sx={{ border: "1px solid", borderColor: "divider" }}>
            {sections.map((s, index) => (
              <Box
                key={s.section_id}
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 0.5,
                  p: 1.5,
                  borderBottom: index < sections.length - 1 ? "1px solid" : 0,
                  borderColor: "divider",
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
                                  ? `${Number(snap.value.toFixed(1))} ${snap.unit}`
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
          <Typography sx={{ ...labelSx, mb: 0.5 }}>Note</Typography>
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
            {descent.note}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
