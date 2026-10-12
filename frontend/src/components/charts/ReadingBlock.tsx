import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import TuneIcon from "@mui/icons-material/Tune";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import { type Ref, useState } from "react";
import type { TimeRange } from "@/components/charts/water/types";
import { alphas, labelSx, theme } from "@/lib/theme";

const { tokens } = theme;

/** The periods the rail offers; "30d" is the chart's one-month range. */
const PERIODS: { value: TimeRange; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "1m", label: "30d" },
  { value: "1y", label: "1y" },
];

/** What the block says about the newest reading (or the one scrubbed). */
export interface ReadingView {
  /** Null when there is no reading at all. */
  value: number | null;
  unit: string;
  /** "18:48" or "Oct 10, 14:00". */
  time: string;
  /** Level word and its dot colour; absent while stale or scrubbing. */
  level?: { word: string; color: string };
  /** "falling 24 cm in 24 h", "steady"; absent without a trend. */
  trend?: string;
  stale: boolean;
  scrubbing: boolean;
}

interface ReadingBlockProps {
  gauges: { id: number; name: string }[];
  gaugeId: number | null;
  onGauge: (id: number) => void;
  view: ReadingView | null;
  onLatest: () => void;
  timeRange: TimeRange;
  onTimeRange: (range: TimeRange) => void;
  /** The options button, absent when there is nothing to choose. */
  options?: {
    open: boolean;
    onToggle: () => void;
    buttonRef: Ref<HTMLButtonElement>;
  };
}

function GaugeName({
  gauges,
  gaugeId,
  onGauge,
}: Pick<ReadingBlockProps, "gauges" | "gaugeId" | "onGauge">) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const current = gauges.find((g) => g.id === gaugeId) ?? gauges[0];
  const text = (
    <Typography
      component="span"
      noWrap
      sx={{ fontSize: "0.8125rem", fontWeight: 600 }}
    >
      {current?.name ?? ""}
    </Typography>
  );
  if (gauges.length < 2) {
    return (
      <Box sx={{ minWidth: 0, display: "flex", alignItems: "center" }}>
        {text}
      </Box>
    );
  }
  return (
    <>
      <ButtonBase
        aria-haspopup="listbox"
        aria-label={`Gauge: ${current?.name ?? ""}`}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{
          minHeight: tokens.touch.min,
          minWidth: 0,
          gap: 0.5,
          justifyContent: "flex-start",
        }}
      >
        {text}
        <ExpandMoreIcon fontSize="small" />
      </ButtonBase>
      <Menu
        anchorEl={anchor}
        open={anchor != null}
        onClose={() => setAnchor(null)}
      >
        {gauges.map((g) => (
          <MenuItem
            key={g.id}
            selected={g.id === current?.id}
            onClick={() => {
              onGauge(g.id);
              setAnchor(null);
            }}
            sx={{ minHeight: tokens.touch.min }}
          >
            {g.name}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

function Period({
  value,
  onChange,
}: {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}) {
  return (
    <Box
      role="group"
      aria-label="Period"
      sx={{
        display: "flex",
        gap: "2px",
        p: "2px",
        bgcolor: tokens.surfaceLow,
        borderRadius: `${tokens.radii.sm}px`,
      }}
    >
      {PERIODS.map((p) => {
        const on = p.value === value;
        return (
          <ButtonBase
            key={p.value}
            aria-pressed={on}
            onClick={() => onChange(p.value)}
            sx={{
              flex: 1,
              minHeight: tokens.touch.min,
              fontSize: "0.875rem",
              fontWeight: on ? 600 : 500,
              fontVariantNumeric: "tabular-nums",
              color: on ? tokens.onSurface : tokens.onSurfaceVariant,
              bgcolor: on ? tokens.surface : "transparent",
              boxShadow: on ? tokens.elevation.e1 : "none",
              borderRadius: `${tokens.radii.sm - 2}px`,
            }}
          >
            {p.label}
          </ButtonBase>
        );
      })}
    </Box>
  );
}

function Reading({
  view,
  onLatest,
}: {
  view: ReadingView;
  onLatest: () => void;
}) {
  const dim = view.stale || view.value == null;
  return (
    <Box
      data-testid="chart-reading"
      sx={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "baseline",
        columnGap: 1.25,
        minWidth: 0,
      }}
    >
      <Box component="span" sx={{ whiteSpace: "nowrap" }}>
        <Typography
          component="span"
          sx={{
            fontSize: "2.25rem",
            lineHeight: "44px",
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            color: dim ? tokens.onSurfaceVariant : tokens.onSurface,
          }}
        >
          {view.value == null ? "-" : Number(view.value.toFixed(1))}
        </Typography>
        {view.value != null && (
          <Typography
            component="span"
            sx={{
              ml: 0.75,
              fontSize: "0.9375rem",
              color: tokens.onSurfaceVariant,
            }}
          >
            {view.unit}
          </Typography>
        )}
      </Box>
      {view.level && (
        <Box
          component="span"
          data-testid="reading-level"
          sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}
        >
          <Box
            aria-hidden
            sx={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              bgcolor: view.level.color,
            }}
          />
          <Typography
            component="span"
            sx={{ fontSize: "0.875rem", fontWeight: 600 }}
          >
            {view.level.word}
            {view.trend ? `, ${view.trend}` : ""}
          </Typography>
        </Box>
      )}
      {!view.level && view.trend && !view.stale && (
        <Typography component="span" sx={{ fontSize: "0.875rem" }}>
          {view.trend}
        </Typography>
      )}
      {view.stale && (
        <Typography
          component="span"
          sx={{ fontSize: "0.875rem", color: tokens.onSurfaceVariant }}
        >
          No recent reading
        </Typography>
      )}
      {view.value != null && (
        <Typography
          component="span"
          sx={{
            ...labelSx,
            fontWeight: 500,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {view.time}
        </Typography>
      )}
      {view.scrubbing && (
        <ButtonBase
          onClick={onLatest}
          sx={{
            minHeight: tokens.touch.min,
            px: 0.5,
            fontSize: "0.875rem",
            fontWeight: 600,
            color: tokens.primary,
          }}
        >
          Latest
        </ButtonBase>
      )}
    </Box>
  );
}

/** The chart's reading: which gauge, the level and what it does, the period.
 * It is the foot of the detail card on a wide screen and the first block of
 * the card below that. */
export default function ReadingBlock({
  gauges,
  gaugeId,
  onGauge,
  view,
  onLatest,
  timeRange,
  onTimeRange,
  options,
}: ReadingBlockProps) {
  return (
    <Box
      data-testid="reading-block"
      sx={{
        height: "100%",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: 0.5,
        px: 2,
        pb: 1.5,
        minWidth: 0,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: tokens.touch.min,
          mr: -1.5,
        }}
      >
        <GaugeName gauges={gauges} gaugeId={gaugeId} onGauge={onGauge} />
        {options && (
          <IconButton
            ref={options.buttonRef}
            aria-label="Chart options"
            aria-haspopup="dialog"
            aria-expanded={options.open}
            onClick={options.onToggle}
            sx={{
              width: tokens.touch.min,
              height: tokens.touch.min,
              color: options.open ? tokens.primary : "text.secondary",
              boxShadow: options.open
                ? `inset 0 0 0 2px ${tokens.primary}`
                : "none",
              bgcolor: options.open
                ? `${tokens.primary}${alphas.wash}`
                : "transparent",
            }}
          >
            <TuneIcon fontSize="small" />
          </IconButton>
        )}
      </Box>
      {view && <Reading view={view} onLatest={onLatest} />}
      <Period value={timeRange} onChange={onTimeRange} />
    </Box>
  );
}
