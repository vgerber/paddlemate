import CloseIcon from "@mui/icons-material/Close";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import TuneIcon from "@mui/icons-material/Tune";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  TIME_RANGE_OPTIONS,
  typeLabel,
} from "@/components/charts/water/chartTime";
import {
  activeMeasurementType,
  readingPerType,
} from "@/components/charts/water/series";
import type { TimeRange } from "@/components/charts/water/types";
import type { WaterRangeWithStatus } from "@/lib/api";
import { formatDate, formatReading, formatTime } from "@/lib/format";
import { alphas, theme } from "@/lib/theme";

const { tokens } = theme;

/** Room above the plot for the outline, so it never covers the line. */
const OUTLINE_HEADROOM = 46;
const CLOSED_HEADROOM = 6;

// The phone height gives way on short screens but never below 160px (a taller chart pushes the strip under the FAB at 320px), so the
// threshold labels keep clear of each other at 320px wide.
const heights = {
  base: { xs: "clamp(160px, 24vh, 210px)", md: "clamp(200px, 26vh, 340px)" },
  tall: { xs: 340, md: "clamp(280px, 42vh, 520px)" },
} as const;

/** Today's readings show their time, older ones their date. */
function readingTime(iso: string): string {
  return new Date(iso).toDateString() === new Date().toDateString()
    ? formatTime(iso)
    : formatDate(iso);
}

const chipSx = (on: boolean) =>
  ({
    border: "none",
    height: tokens.touch.min,
    borderRadius: `${tokens.radii.pill}px`,
    bgcolor: "transparent",
    color: "text.primary",
    fontVariantNumeric: "tabular-nums",
    boxShadow: on
      ? `inset 0 0 0 2px ${tokens.primary}`
      : `inset 0 0 0 1px ${tokens.outlineVariant}`,
    "&:hover": { bgcolor: "transparent" },
  }) as const;

interface ChartCardProps {
  ranges: WaterRangeWithStatus[];
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  measurementType: string | null;
  onMeasurementTypeChange: (type: string) => void;
  preferredFeatureId?: number | null;
  /** Lets the chart grow taller, for when nothing else is competing for the
   * space (the features list is folded). */
  tall?: boolean;
  /** Offered in the open options when the card shows a picked gauge. */
  onDismiss?: () => void;
  /** Under the chart, e.g. the gauge credit. */
  footer?: ReactNode;
  /** "dock" fills the canvas chart dock, which owns the card's surface,
   * radius and shadow; the plot takes the height the options leave. */
  variant?: "card" | "dock";
  /** The chart, given the room to keep above its plot. */
  children: (headroom: number) => ReactNode;
}

/** The chart card. Closed it is the chart edge to edge with a faint outline
 * (the charted reading, its time and the period) and one options button;
 * open, the options sit above the chart: which reading, which period. */
export default function ChartCard({
  ranges,
  timeRange,
  onTimeRangeChange,
  measurementType,
  onMeasurementTypeChange,
  preferredFeatureId,
  tall = false,
  onDismiss,
  footer,
  variant = "card",
  children,
}: ChartCardProps) {
  const docked = variant === "dock";
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const toggled = useRef(false);
  // The control that was pressed leaves the page; hand focus to its
  // counterpart so a keyboard user never lands on the body.
  useEffect(() => {
    if (!toggled.current) return;
    (open ? closeRef : openRef).current?.focus();
  }, [open]);
  const type = activeMeasurementType(ranges, measurementType);
  const readings = readingPerType(ranges, preferredFeatureId);
  const charted = readings.find((r) => r.type === type)?.range;
  const latest = charted?.latest_reading;
  const period =
    TIME_RANGE_OPTIONS.find((o) => o.value === timeRange)?.label ?? timeRange;
  const chartedText = latest
    ? formatReading(latest.value, charted?.series.unit ?? "")
    : typeLabel(type ?? "");

  return (
    <Box
      data-testid="chart-card"
      sx={
        docked
          ? {
              height: "100%",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }
          : {
              // The pane has no side padding; every list in it sets its own 12px.
              mx: 1.5,
              mt: 1.5,
              flexShrink: 0,
              bgcolor: tokens.surface,
              borderRadius: `${tokens.radii.md}px`,
              boxShadow: tokens.elevation.e1,
              overflow: "hidden",
            }
      }
    >
      {open && (
        <Box
          sx={{
            display: "grid",
            gap: 1.25,
            px: 1.75,
            pt: 1.5,
            pb: 1.25,
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) 44px",
              alignItems: "center",
              mr: -1.25,
            }}
          >
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              {readings.map(({ type: t, range }) => (
                <Chip
                  key={t}
                  data-testid="chart-option-chip"
                  aria-pressed={t === type}
                  clickable
                  variant="outlined"
                  label={
                    range.latest_reading
                      ? formatReading(
                          range.latest_reading.value,
                          range.series.unit,
                        )
                      : typeLabel(t)
                  }
                  onClick={() => onMeasurementTypeChange(t)}
                  sx={chipSx(t === type)}
                />
              ))}
            </Box>
            <IconButton
              ref={closeRef}
              aria-label="Close chart options"
              aria-expanded
              onClick={() => {
                toggled.current = true;
                setOpen(false);
              }}
              sx={{
                width: tokens.touch.min,
                height: tokens.touch.min,
                color: "text.secondary",
              }}
            >
              <ExpandLessIcon />
            </IconButton>
          </Box>
          <Box sx={{ display: "flex", gap: 0.5 }}>
            {TIME_RANGE_OPTIONS.map((o) => (
              <Chip
                key={o.value}
                data-testid="chart-option-chip"
                aria-pressed={o.value === timeRange}
                clickable
                variant="outlined"
                label={o.label}
                onClick={() => onTimeRangeChange(o.value)}
                sx={{
                  ...chipSx(o.value === timeRange),
                  flex: 1,
                  minWidth: 0,
                  "& .MuiChip-label": { px: 0.5 },
                }}
              />
            ))}
          </Box>
          {charted && (
            <Box sx={{ display: "flex", alignItems: "center", mr: -1.25 }}>
              <Typography
                variant="body2"
                sx={{ flex: 1, minWidth: 0, color: "text.secondary" }}
              >
                {charted.gauge.name}
                {latest && ` · ${readingTime(latest.measured_at)}`}
              </Typography>
              {onDismiss && (
                <IconButton
                  aria-label="Close gauge chart"
                  onClick={onDismiss}
                  sx={{
                    width: tokens.touch.min,
                    height: tokens.touch.min,
                    my: -1.25,
                    color: "text.secondary",
                  }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              )}
            </Box>
          )}
        </Box>
      )}
      <Box
        sx={{
          position: "relative",
          ...(docked
            ? { flex: 1, minHeight: 0 }
            : { height: tall ? heights.tall : heights.base }),
        }}
      >
        {children(open ? CLOSED_HEADROOM : OUTLINE_HEADROOM)}
        {!open && charted && (
          <>
            <Box
              data-testid="chart-outline"
              sx={{
                position: "absolute",
                left: 14,
                top: 10,
                right: 52,
                display: "flex",
                alignItems: "baseline",
                gap: 1,
                pointerEvents: "none",
                textShadow: `0 0 6px ${tokens.surface}, 0 0 2px ${tokens.surface}`,
              }}
            >
              <Typography
                data-testid="chart-reading"
                component="span"
                sx={{
                  fontSize: "1.25rem",
                  lineHeight: "24px",
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  color: tokens.onSurface,
                }}
              >
                {chartedText}
              </Typography>
              <Typography
                component="span"
                sx={{
                  fontSize: "0.8125rem",
                  fontWeight: 500,
                  fontVariantNumeric: "tabular-nums",
                  color: "text.secondary",
                }}
              >
                {latest ? `${readingTime(latest.measured_at)} · ` : ""}
                {period}
              </Typography>
            </Box>
            <IconButton
              ref={openRef}
              aria-label="Chart options"
              aria-expanded={false}
              onClick={() => {
                toggled.current = true;
                setOpen(true);
              }}
              sx={{
                position: "absolute",
                right: 4,
                top: 4,
                width: tokens.touch.min,
                height: tokens.touch.min,
                color: "text.secondary",
              }}
            >
              <Box
                sx={{
                  width: 30,
                  height: 30,
                  borderRadius: `${tokens.radii.sm}px`,
                  display: "grid",
                  placeItems: "center",
                  bgcolor: `${tokens.surface}${alphas.scrim}`,
                  boxShadow: `inset 0 0 0 1px ${tokens.outlineVariant}`,
                }}
              >
                <TuneIcon sx={{ fontSize: 18 }} />
              </Box>
            </IconButton>
          </>
        )}
      </Box>
      {footer && <Box sx={{ px: 1.75, pb: 1 }}>{footer}</Box>}
    </Box>
  );
}
