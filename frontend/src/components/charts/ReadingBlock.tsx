import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import { useLayoutEffect, useRef, useState } from "react";
import { Segment, SegmentTrack } from "@/components/canvas/SegmentedControl";
import PeriodMenu, { type PeriodControl } from "@/components/charts/PeriodMenu";
import { CloseIcon, ExpandIcon } from "@/lib/icons";
import { css, prefersReducedMotion, REDUCED_FADE_MS } from "@/lib/motion";
import { theme } from "@/lib/theme";

const { tokens } = theme;

/** What the block says about the newest reading (or the one scrubbed): when,
 * and which level. The value itself is drawn at the line's end. */
export interface ReadingView {
  /** "18:48" or "Oct 10, 14:00"; empty when there is no reading at all. */
  time: string;
  /** "12m ago", beside the time. */
  age: string;
  /** The reading shown: the latest, or the hovered point. */
  value: number | null;
  unit: string;
  /** Level word and its dot colour; absent while stale or uncalibrated. */
  level?: { word: string; color: string };
  stale: boolean;
}

interface ReadingBlockProps {
  gauges: { id: number; name: string }[];
  gaugeId: number | null;
  onGauge: (id: number) => void;
  view: ReadingView | null;
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
  period?: PeriodControl;
  /** Side padding in px: the text line the block keeps. */
  inset?: number;
  /** The reading's size: larger on the rail, where the block is tall. */
  numberSize?: number;
  /** The phone card's head: the reading first, then its time with the
   * Level | Flow choice at the right; the gauge is named only when it can
   * be picked; the close mark floats top right. */
  phone?: boolean;
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
        <ExpandIcon fontSize="small" />
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
            sx={{ "&&": { minHeight: tokens.touch.min } }}
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
    <SegmentTrack label="Reading">
      {types.map((t) => (
        <Segment
          key={t.type}
          compact
          active={t.type === type}
          onClick={() => onType(t.type)}
        >
          {t.label}
        </Segment>
      ))}
    </SegmentTrack>
  );
}

const NUMBER_SHIFT = 4;

/** The reading's number in a fixed cell: a new value rises in while the old
 * one moves up and out (cross-fade only when reduced). Tabular figures keep
 * both the same width. */
function ReadingNumber({
  text,
  size,
  stale,
}: {
  text: string;
  size: number;
  stale: boolean;
}) {
  const shown = useRef(text);
  const [leaving, setLeaving] = useState<string | null>(null);
  const [changes, setChanges] = useState(0);
  useLayoutEffect(() => {
    if (text === shown.current) return;
    setLeaving(shown.current);
    setChanges((n) => n + 1);
    shown.current = text;
    const t = setTimeout(
      () => setLeaving(null),
      prefersReducedMotion() ? REDUCED_FADE_MS : theme.tokens.motion.fast,
    );
    return () => clearTimeout(t);
  }, [text]);
  const reduced = prefersReducedMotion();
  const shift = reduced ? 0 : NUMBER_SHIFT;
  const time = reduced ? `${REDUCED_FADE_MS}ms` : css.fast;
  const base = {
    fontSize: size,
    lineHeight: 1,
    fontWeight: 600,
    fontVariantNumeric: "tabular-nums",
    color: stale ? tokens.onSurfaceVariant : tokens.onSurface,
    opacity: stale ? 0.6 : 1,
  } as const;
  return (
    <Box
      component="span"
      data-testid="reading-number"
      // The old value is a pseudo element, so it is never read as text.
      data-prev={leaving ?? undefined}
      sx={{
        display: "inline-block",
        position: "relative",
        "&[data-prev]::before": {
          ...base,
          position: "absolute",
          left: 0,
          top: 0,
          content: "attr(data-prev)",
          animation: `pm-number-out ${time} ${css.easeIn} forwards`,
        },
        "@keyframes pm-number-in": {
          from: { opacity: 0, transform: `translateY(${shift}px)` },
        },
        "@keyframes pm-number-out": {
          to: { opacity: 0, transform: `translateY(-${shift}px)` },
        },
      }}
    >
      <Typography
        component="span"
        key={changes}
        sx={{
          ...base,
          animation:
            changes > 0
              ? `pm-number-in ${time} ${css.easeOut} backwards`
              : "none",
        }}
      >
        {text}
      </Typography>
    </Box>
  );
}

function LevelSkeleton({ size }: { size: number }) {
  return (
    <Box
      data-testid="reading-skeleton"
      sx={{ display: "flex", alignItems: "baseline", gap: 1.25 }}
    >
      <Skeleton
        variant="rounded"
        animation="wave"
        width={size * 1.8}
        height={size}
        sx={{ borderRadius: `${tokens.radii.sm}px` }}
      />
      <Skeleton variant="text" animation="wave" width={56} height={20} />
    </Box>
  );
}

function Level({ view, size }: { view: ReadingView; size: number }) {
  return (
    <Box data-testid="chart-reading" sx={{ minWidth: 0 }}>
      <Box
        sx={{ display: "flex", alignItems: "baseline", gap: 1.25, minWidth: 0 }}
      >
        <Box
          component="span"
          data-testid="reading-value"
          sx={{ whiteSpace: "nowrap" }}
        >
          <ReadingNumber
            text={
              view.value == null ? "-" : String(Number(view.value.toFixed(1)))
            }
            size={size}
            stale={view.stale}
          />
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
          <Box
            component="span"
            data-testid="reading-level-stale"
            sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}
          >
            {view.stale && (
              <Box
                aria-hidden
                sx={{
                  width: 10,
                  height: 10,
                  boxSizing: "border-box",
                  borderRadius: "50%",
                  border: `1.5px dashed ${tokens.onSurfaceVariant}`,
                }}
              />
            )}
            <Typography
              component="span"
              sx={{ fontSize: "0.875rem", color: tokens.onSurfaceVariant }}
            >
              {view.stale ? "No recent reading" : ""}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}

function CloseGauge({ onDismiss }: { onDismiss: () => void }) {
  return (
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
  );
}

function PhoneHead({
  gauges,
  gaugeId,
  onGauge,
  view,
  measurement,
  onDismiss,
  inset,
  numberSize,
}: Omit<ReadingBlockProps, "phone" | "period" | "inset" | "numberSize"> & {
  inset: number;
  numberSize: number;
}) {
  return (
    <Box
      data-testid="reading-block"
      sx={{ position: "relative", px: `${inset}px`, pt: 1.5, minWidth: 0 }}
    >
      {onDismiss && (
        <Box sx={{ position: "absolute", top: 0, right: 0 }}>
          <CloseGauge onDismiss={onDismiss} />
        </Box>
      )}
      {gauges.length > 1 && (
        <GaugeName gauges={gauges} gaugeId={gaugeId} onGauge={onGauge} />
      )}
      {view ? (
        <Level view={view} size={numberSize} />
      ) : (
        <LevelSkeleton size={numberSize} />
      )}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 1,
          minHeight: 24,
          mt: 0.5,
        }}
      >
        {view?.time && (
          <Typography
            data-testid="reading-time"
            sx={{
              fontSize: "0.75rem",
              color: tokens.onSurfaceVariant,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {view.age ? `${view.time} · ${view.age}` : view.time}
          </Typography>
        )}
        {measurement && measurement.types.length > 1 && (
          <Measurement {...measurement} />
        )}
      </Box>
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
  measurement,
  onDismiss,
  period,
  inset = 24,
  numberSize = 36,
  phone = false,
}: ReadingBlockProps) {
  if (phone) {
    return (
      <PhoneHead
        gauges={gauges}
        gaugeId={gaugeId}
        onGauge={onGauge}
        view={view}
        measurement={measurement}
        onDismiss={onDismiss}
        inset={inset}
        numberSize={numberSize}
      />
    );
  }
  return (
    <Box
      data-testid="reading-block"
      sx={{
        height: "100%",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        px: `${inset}px`,
        pt: 1,
        pb: 2.5,
        minWidth: 0,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 1,
          // The trailing boxes end 12px from the edge.
          mr: -1.5,
        }}
      >
        <Box sx={{ minWidth: 0, pt: 0.5 }}>
          <GaugeName gauges={gauges} gaugeId={gaugeId} onGauge={onGauge} />
          {view?.time && (
            <Typography
              data-testid="reading-time"
              sx={{
                fontSize: "0.75rem",
                color: tokens.onSurfaceVariant,
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
              }}
            >
              {view.age ? `${view.time} · ${view.age}` : view.time}
            </Typography>
          )}
        </Box>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            flexShrink: 0,
          }}
        >
          {period && <PeriodMenu {...period} />}
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
      {/* Room for an outlook line once there are forecasts; the number below
          keeps its place. */}
      <Box sx={{ flex: 1, minHeight: 8 }} />
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 1,
        }}
      >
        {view ? (
          <Level view={view} size={numberSize} />
        ) : (
          <LevelSkeleton size={numberSize} />
        )}
        {measurement && measurement.types.length > 1 && (
          <Measurement {...measurement} />
        )}
      </Box>
    </Box>
  );
}
