import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Collapse from "@mui/material/Collapse";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import { addMonths, format, parseISO, startOfMonth } from "date-fns";
import { type PointerEvent, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/lib/icons";
import { css, durations } from "@/lib/motion";
import { alphas, fonts, theme } from "@/lib/theme";
import { monthGrid } from "@/lib/tripTimeline";
import { pulledOpen, weekDays } from "./planWeek";

const { tokens } = theme;

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const DISC = 36;
const BAND_INSET = 4;
const GRABBER = 16;
const MARK = 5;
const MARK_GAP = 3;

// Seven columns, the first disc's left edge on the 28 line and the last
// one's right edge on the right line: the disc centre of column one sits at
// line + DISC / 2, which solves to this padding (a percentage is of the
// strip's width). Capped so seven 44px hit cells still fit at 320.
const STRIP_PAD = `min(calc((${tokens.phone.line + DISC / 2}px - 100% / 14) * 7 / 6), calc(50% - ${(7 * tokens.touch.min) / 2}px))`;

interface Props {
  /** The day the reader is on; its week is the one shown. */
  current: string;
  today: string;
  /** The trip's own span, tinted. */
  from: string;
  to: string | null;
  /** Days that have a card in the list below, so can be jumped to. */
  planned: Set<string>;
  /** Runs per day, drawn as dots under the number. */
  runs: Map<string, number>;
  /** The month is open; owned by the plan so it can dim the list behind it. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (date: string) => void;
}

/** The plan's calendar, pinned above the list: this week as one row, pulled
 * or tapped open to the month. Choosing a day jumps the list to it. */
export default function PlanCalendar({
  current,
  today,
  from,
  to,
  planned,
  runs,
  open,
  onOpenChange,
  onPick,
}: Props) {
  const [cursor, setCursor] = useState(() => startOfMonth(parseISO(current)));
  const drag = useRef<number | null>(null);

  const pick = (date: string) => {
    onOpenChange(false);
    onPick(date);
  };

  const toggle = () => {
    if (!open) setCursor(startOfMonth(parseISO(current)));
    onOpenChange(!open);
  };

  const onDown = (e: PointerEvent<HTMLElement>) => {
    drag.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onUp = (e: PointerEvent<HTMLElement>) => {
    const y0 = drag.current;
    drag.current = null;
    if (y0 === null) return;
    const dy = e.clientY - y0;
    // A tap is a toggle; a pull goes the way it was pulled.
    if (Math.abs(dy) < 6) toggle();
    else {
      const next = pulledOpen(dy, open);
      if (next && !open) setCursor(startOfMonth(parseISO(current)));
      onOpenChange(next);
    }
  };

  const days = { today, current, from, to, runs, planned, onPick: pick };

  return (
    <Box
      data-testid="week-strip"
      sx={{
        flexShrink: 0,
        position: "relative",
        zIndex: 1,
        bgcolor: tokens.surface,
        boxShadow: tokens.elevation.e1,
        pt: 0.75,
        px: STRIP_PAD,
      }}
    >
      <Collapse in={open} timeout={durations.base} unmountOnExit>
        <MonthView cursor={cursor} onCursorChange={setCursor} {...days} />
      </Collapse>

      {!open && (
        <>
          <WeekdayHeader />
          <WeekRow dates={weekDays(current)} {...days} />
        </>
      )}

      <ButtonBase
        aria-label={open ? "Show the week" : "Show the month"}
        aria-expanded={open}
        onPointerDown={onDown}
        onPointerUp={onUp}
        // Keyboard activation has no pointer; it arrives as a click with no
        // detail.
        onClick={(e) => {
          if (e.detail === 0) toggle();
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        sx={{
          position: "relative",
          width: "100%",
          height: GRABBER,
          mt: 1,
          mb: 0.75,
          // The drag is ours: the browser must not take it as a scroll.
          touchAction: "none",
          // 16px to look at, 44px to hit; the extra reaches down into the
          // list so it never steals taps from the day row above.
          "&::after": {
            content: '""',
            position: "absolute",
            left: 0,
            right: 0,
            top: -6,
            bottom: -(tokens.touch.min - GRABBER - 6),
          },
        }}
      >
        <Box
          sx={{
            width: 36,
            height: 4,
            borderRadius: `${tokens.radii.xs}px`,
            bgcolor: `${tokens.outlineVariant}`,
          }}
        />
      </ButtonBase>
    </Box>
  );
}

interface DayProps {
  today: string;
  /** The day the reader is on; null where nothing is picked. */
  current: string | null;
  /** The trip's own span, tinted. */
  from: string;
  to: string | null;
  runs: Map<string, number>;
  /** Days that can be picked; null means every day. */
  planned: Set<string> | null;
  onPick: (date: string) => void;
}

/** A month with its title and arrows, in the same cells as the week, so the
 * plan and the "add a day" picker draw one calendar. */
export function MonthView({
  cursor,
  onCursorChange,
  ...days
}: DayProps & { cursor: Date; onCursorChange: (cursor: Date) => void }) {
  const monthPrefix = format(cursor, "yyyy-MM");
  return (
    <Box data-testid="month-grid">
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: `${tokens.touch.min}px minmax(0, 1fr) ${tokens.touch.min}px`,
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <IconButton
          aria-label="Previous month"
          onClick={() => onCursorChange(addMonths(cursor, -1))}
          sx={{ width: tokens.touch.min, height: tokens.touch.min }}
        >
          <ChevronLeftIcon />
        </IconButton>
        <Typography
          sx={{ fontFamily: fonts.body, fontWeight: 600, fontSize: 15 }}
        >
          {format(cursor, "MMMM yyyy")}
        </Typography>
        <IconButton
          aria-label="Next month"
          onClick={() => onCursorChange(addMonths(cursor, 1))}
          sx={{ width: tokens.touch.min, height: tokens.touch.min }}
        >
          <ChevronRightIcon />
        </IconButton>
      </Box>
      <WeekdayHeader />
      {monthGrid(cursor.getFullYear(), cursor.getMonth() + 1).map((week) => (
        <WeekRow
          key={week[0]}
          dates={week}
          dimmed={(d) => !d.startsWith(monthPrefix)}
          {...days}
        />
      ))}
    </Box>
  );
}

function WeekdayHeader() {
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

/** The in-trip stretches of a row as [first, last] column pairs. */
function stretches(flags: boolean[]): [number, number][] {
  const out: [number, number][] = [];
  flags.forEach((on, i) => {
    if (!on) return;
    const last = out[out.length - 1];
    if (last && last[1] === i - 1) last[1] = i;
    else out.push([i, i]);
  });
  return out;
}

/** Seven days. The trip's span is one rounded band behind them and the
 * current day one disc, both drawn on the row so they can have shape and
 * move; the cells on top only carry the numbers. */
function WeekRow({
  dates,
  dimmed,
  today,
  current,
  from,
  to,
  runs,
  planned,
  onPick,
}: DayProps & { dates: string[]; dimmed?: (date: string) => boolean }) {
  const col = current === null ? -1 : dates.indexOf(current);
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
            bgcolor: `${tokens.primary}${alphas.hover}`,
          }}
        />
      ))}
      {col >= 0 && (
        <Box
          data-testid="current-disc"
          sx={{
            position: "absolute",
            top: 6,
            left: 0,
            width: "calc(100% / 7)",
            display: "grid",
            placeItems: "center",
            transform: `translateX(${col * 100}%)`,
            // The disc slides to the new day as the list scrolls.
            transition: `transform ${css.base} ${css.easeInOut}`,
          }}
        >
          <Box
            sx={{
              width: DISC,
              height: DISC,
              borderRadius: "50%",
              bgcolor: tokens.primary,
              // Today and current: a white gap, then the accent ring.
              boxShadow:
                current === today
                  ? `0 0 0 2px ${tokens.surface}, 0 0 0 4px ${tokens.primary}`
                  : "none",
            }}
          />
        </Box>
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
      aria-label={format(parseISO(date), "EEE, dd MMM")}
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
          transition: `color ${css.base} ${css.easeInOut}`,
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
