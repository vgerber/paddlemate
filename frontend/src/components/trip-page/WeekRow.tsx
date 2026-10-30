import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import { format, parseISO } from "date-fns";
import { useState } from "react";
import { withAlpha } from "@/lib/theme/alpha";
import { css, useReducedMotion } from "@/lib/theme/motion";
import { fonts, theme } from "@/lib/theme/theme";
import { stretches } from "./calendarBands";
import { BAND_INSET, DISC, MARK, MARK_GAP, WEEKDAYS } from "./calendarSizes";
import type { DayProps } from "./calendarTypes";
import { useDiscFade } from "./useWeekMotion";

const { tokens } = theme;

export function WeekdayHeader() {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
      {WEEKDAYS.map((d) => (
        <Typography
          key={d}
          sx={{
            textAlign: "center",
            fontSize: 11,
            lineHeight: "16px",
            fontWeight: 500,
            color: "text.secondary",
          }}
        >
          {d}
        </Typography>
      ))}
    </Box>
  );
}

/** Seven days. The trip's span is one rounded band behind them and the
 * current day one disc, both drawn on the row so they can have shape and
 * move; the cells on top only carry the numbers. */
export function WeekRow({
  dates,
  dimmed,
  today,
  current,
  from,
  to,
  runs,
  planned,
  onPick,
  discFade,
}: DayProps & {
  dates: string[];
  dimmed?: (date: string) => boolean;
  /** The pane's role while weeks swap: its disc fades in or out. */
  discFade?: "rest" | "in" | "out";
}) {
  const reduced = useReducedMotion();
  const col = current === null ? -1 : dates.indexOf(current);
  // Under reduced motion the disc does not travel: the old one fades out where
  // it was while the new one fades in.
  const [seen, setSeen] = useState(col);
  const [ghost, setGhost] = useState<number | null>(null);
  const [fresh, setFresh] = useState(false);
  if (col !== seen) {
    setSeen(col);
    setFresh(true);
    setGhost(reduced && seen >= 0 && col >= 0 ? seen : null);
  }
  const bands = stretches(
    dates.map((d) => d >= from && (to === null || d <= to)),
  );
  return (
    <Box
      sx={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: "repeat(7, 1fr)",
      }}
    >
      {bands.map(([a, b]) => (
        <Box
          key={a}
          data-testid="trip-band"
          sx={{
            position: "absolute",
            top: 6,
            height: DISC,
            left: `calc(${a} * 100% / 7 + ${BAND_INSET}px)`,
            width: `calc(${b - a + 1} * 100% / 7 - ${2 * BAND_INSET}px)`,
            borderRadius: `${DISC / 2}px`,
            bgcolor: withAlpha(tokens.primary, "hover"),
          }}
        />
      ))}
      {col >= 0 && (
        <Disc
          key={reduced ? col : "disc"}
          col={col}
          ring={current === today}
          fade={reduced ? (fresh ? "in" : "rest") : discFade}
        />
      )}
      {ghost !== null && (
        <Disc
          col={ghost}
          ring={false}
          fade="out"
          onDone={() => setGhost(null)}
        />
      )}
      {dates.map((d) => (
        <DayCell
          key={d}
          date={d}
          dim={dimmed?.(d) ?? false}
          today={d === today}
          current={d === current}
          runs={runs.get(d) ?? 0}
          enabled={planned === null || planned.has(d)}
          onPick={() => onPick(d)}
        />
      ))}
    </Box>
  );
}

function Disc({
  col,
  ring,
  fade = "rest",
  onDone,
}: {
  col: number;
  ring: boolean;
  fade?: "rest" | "in" | "out";
  onDone?: () => void;
}) {
  const ref = useDiscFade(fade, onDone);
  return (
    <Box
      ref={ref}
      data-testid={onDone ? "ghost-disc" : "current-disc"}
      sx={{
        position: "absolute",
        top: 6,
        left: 0,
        width: "calc(100% / 7)",
        display: "grid",
        placeItems: "center",
        transform: `translateX(${col * 100}%)`,
        // The disc slides to the new day as the list scrolls; a new target
        // retargets the slide from where it is.
        transition: `transform ${css.base} ${css.easeInOut}`,
      }}
    >
      <Box
        sx={{
          width: DISC,
          height: DISC,
          borderRadius: "50%",
          bgcolor: tokens.primaryFill,
          // Today and current: a white gap, then the accent ring.
          boxShadow: ring
            ? `0 0 0 2px ${tokens.surface}, 0 0 0 4px ${tokens.primaryFill}`
            : "none",
        }}
      />
    </Box>
  );
}

function DayCell({
  date,
  dim,
  today,
  current,
  runs,
  enabled,
  onPick,
}: {
  date: string;
  dim: boolean;
  today: boolean;
  current: boolean;
  runs: number;
  enabled: boolean;
  onPick: () => void;
}) {
  const faded = dim || !enabled;
  return (
    <ButtonBase
      data-testid="week-day"
      data-date={date}
      data-today={today}
      data-current={current}
      data-runs={runs}
      disabled={!enabled}
      aria-label={format(parseISO(date), "EEE, d MMM")}
      aria-current={today ? "date" : undefined}
      onClick={onPick}
      sx={{
        position: "relative",
        height: 48,
        minWidth: tokens.touch.min,
        display: "grid",
        placeItems: "center",
        "&.Mui-disabled": { opacity: 1 },
      }}
    >
      <Box
        data-testid="day-number"
        sx={{
          position: "relative",
          pb: runs > 0 ? "6px" : 0,
          width: DISC,
          height: DISC,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          fontFamily: fonts.body,
          fontSize: 15,
          fontWeight: current ? 700 : 500,
          fontVariantNumeric: "tabular-nums",
          // The digit turns white as the disc arrives under it.
          transition: `color ${css.fast} ${css.easeInOut} 60ms`,
          'html[data-motion="reduced"] &': { transitionDelay: "0ms" },
          // Days outside the month or without a card sit back.
          opacity: faded && !current ? 0.55 : 1,
          color: current
            ? tokens.onPrimary
            : faded
              ? tokens.onSurfaceVariant
              : tokens.onSurface,
          boxShadow:
            today && !current ? `inset 0 0 0 2px ${tokens.primary}` : "none",
        }}
      >
        {Number(date.slice(8, 10))}
        {runs > 0 && (
          <Box
            data-testid="run-marks"
            sx={{
              position: "absolute",
              bottom: 4,
              left: 0,
              right: 0,
              display: "flex",
              justifyContent: "center",
              gap: `${MARK_GAP}px`,
            }}
          >
            {Array.from({ length: runs }, (_, i) => (
              <Box
                key={i}
                data-testid="run-mark"
                sx={{
                  width: MARK,
                  height: MARK,
                  borderRadius: "50%",
                  bgcolor: current ? tokens.onPrimary : tokens.onSurfaceVariant,
                }}
              />
            ))}
          </Box>
        )}
      </Box>
    </ButtonBase>
  );
}
