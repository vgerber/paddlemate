import CloseIcon from "@mui/icons-material/Close";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import PeriodMenu from "@/components/charts/PeriodMenu";
import type { TimeRange } from "@/components/charts/water/types";
import { theme } from "@/lib/theme";

const { tokens } = theme;

/** What the block says about the newest reading (or the one scrubbed): when,
 * and which level. The value itself is drawn at the line's end. */
export interface ReadingView {
  /** "18:48" or "Oct 10, 14:00"; empty when there is no reading at all. */
  time: string;
  /** Level word and its dot colour; absent while stale or uncalibrated. */
  level?: { word: string; color: string };
  stale: boolean;
  scrubbing: boolean;
}

interface ReadingBlockProps {
  gauges: { id: number; name: string }[];
  gaugeId: number | null;
  onGauge: (id: number) => void;
  view: ReadingView | null;
  onLatest: () => void;
  /** The Level or Flow choice; only for a gauge that measures both. */
  measurement?: {
    types: { type: string; label: string }[];
    type: string | null;
    onType: (type: string) => void;
  };
  /** Closes a picked gauge's chart. */
  onDismiss?: () => void;
  /** The period control, when it lives in the block (else the caller
   * places it). */
  period?: { value: TimeRange; onChange: (range: TimeRange) => void };
  /** Side padding in px: the text line the block keeps. */
  inset?: number;
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

function Measurement({
  types,
  type,
  onType,
}: NonNullable<ReadingBlockProps["measurement"]>) {
  return (
    <Box
      role="group"
      aria-label="Reading"
      sx={{
        display: "flex",
        gap: "2px",
        p: "2px",
        bgcolor: tokens.surfaceLow,
        borderRadius: `${tokens.radii.sm}px`,
      }}
    >
      {types.map((t) => {
        const on = t.type === type;
        return (
          <ButtonBase
            key={t.type}
            aria-pressed={on}
            onClick={() => onType(t.type)}
            sx={{
              position: "relative",
              minWidth: tokens.touch.min,
              height: 32,
              px: 1.5,
              fontSize: "0.8125rem",
              fontWeight: on ? 600 : 500,
              color: on ? tokens.onSurface : tokens.onSurfaceVariant,
              bgcolor: on ? tokens.surface : "transparent",
              boxShadow: on ? tokens.elevation.e1 : "none",
              borderRadius: `${tokens.radii.sm - 2}px`,
              // The key is 32px to look at and 44px to hit.
              "&::after": {
                content: '""',
                position: "absolute",
                inset: "-6px 0",
              },
            }}
          >
            {t.label}
          </ButtonBase>
        );
      })}
    </Box>
  );
}

function Level({
  view,
  onLatest,
}: {
  view: ReadingView;
  onLatest: () => void;
}) {
  return (
    <Box
      data-testid="chart-reading"
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        minHeight: tokens.touch.min,
        minWidth: 0,
      }}
    >
      {view.level ? (
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
          </Typography>
        </Box>
      ) : (
        <Typography
          component="span"
          sx={{ fontSize: "0.875rem", color: tokens.onSurfaceVariant }}
        >
          {view.stale ? "No recent reading" : ""}
        </Typography>
      )}
      {view.scrubbing && (
        <ButtonBase
          onClick={onLatest}
          sx={{
            minHeight: tokens.touch.min,
            px: 0.5,
            fontSize: "0.75rem",
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

/** The chart's reading: which gauge and when, the level, the period. It is
 * the foot of the detail card on a wide screen and the first block of the
 * card below that. */
export default function ReadingBlock({
  gauges,
  gaugeId,
  onGauge,
  view,
  onLatest,
  measurement,
  onDismiss,
  period,
  inset = 24,
}: ReadingBlockProps) {
  return (
    <Box
      data-testid="reading-block"
      sx={{
        height: "100%",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        px: `${inset}px`,
        pb: 1,
        minWidth: 0,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          minHeight: tokens.touch.min,
          // The close box ends 12px from the edge.
          mr: -1.5,
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "baseline",
            gap: 1,
            minWidth: 0,
          }}
        >
          <GaugeName gauges={gauges} gaugeId={gaugeId} onGauge={onGauge} />
          {view?.time && (
            <Typography
              component="span"
              data-testid="reading-time"
              sx={{
                fontSize: "0.75rem",
                color: tokens.onSurfaceVariant,
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
              }}
            >
              {view.time}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          {measurement && measurement.types.length > 1 && (
            <Measurement {...measurement} />
          )}
          {onDismiss && (
            <IconButton
              aria-label="Close gauge chart"
              onClick={onDismiss}
              sx={{
                width: tokens.touch.min,
                height: tokens.touch.min,
                color: "text.secondary",
              }}
            >
              <CloseIcon sx={{ fontSize: 16 }} />
            </IconButton>
          )}
        </Box>
      </Box>
      {view && <Level view={view} onLatest={onLatest} />}
      {period && (
        <>
          <Box sx={{ flex: 1, minHeight: 8 }} />
          <PeriodMenu {...period} />
        </>
      )}
    </Box>
  );
}
