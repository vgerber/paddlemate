import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Collapse from "@mui/material/Collapse";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import { addMonths, format, parseISO, startOfMonth } from "date-fns";
import { type PointerEvent, useRef, useState } from "react";
import { durations } from "@/lib/motion";
import { alphas, fonts, theme } from "@/lib/theme";
import { monthGrid } from "@/lib/tripTimeline";
import { pulledOpen, weekDays } from "./planWeek";

const { tokens } = theme;

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

interface Props {
  /** The day the reader is on; its week is the one shown. */
  current: string;
  today: string;
  /** The trip's own span, tinted. */
  from: string;
  to: string | null;
  /** Days that have a card in the list below, so can be jumped to. */
  planned: Set<string>;
  /** Days with something on them. */
  withEntries: Set<string>;
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
  withEntries,
  onPick,
}: Props) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => startOfMonth(parseISO(current)));
  const drag = useRef<number | null>(null);

  const pick = (date: string) => {
    setOpen(false);
    onPick(date);
  };

  const toggle = () => {
    if (!open) setCursor(startOfMonth(parseISO(current)));
    setOpen(!open);
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
      setOpen(next);
    }
  };

  const cell = (date: string, dim = false) => (
    <DayCell
      key={date}
      date={date}
      dim={dim}
      today={date === today}
      current={date === current}
      inTrip={date >= from && (to === null || date <= to)}
      hasEntries={withEntries.has(date)}
      enabled={planned.has(date)}
      onPick={() => pick(date)}
    />
  );

  const monthPrefix = format(cursor, "yyyy-MM");

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
      }}
    >
      <Collapse in={open} timeout={durations.base} unmountOnExit>
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
              onClick={() => setCursor((c) => addMonths(c, -1))}
              sx={{ width: tokens.touch.min, height: tokens.touch.min }}
            >
              <ChevronLeftIcon />
            </IconButton>
            <Typography
              sx={{ fontFamily: fonts.label, fontWeight: 600, fontSize: 15 }}
            >
              {format(cursor, "MMMM yyyy")}
            </Typography>
            <IconButton
              aria-label="Next month"
              onClick={() => setCursor((c) => addMonths(c, 1))}
              sx={{ width: tokens.touch.min, height: tokens.touch.min }}
            >
              <ChevronRightIcon />
            </IconButton>
          </Box>
          <WeekdayHeader />
          {monthGrid(cursor.getFullYear(), cursor.getMonth() + 1).map(
            (week) => (
              <Row key={week[0]}>
                {week.map((d) => cell(d, !d.startsWith(monthPrefix)))}
              </Row>
            ),
          )}
        </Box>
      </Collapse>

      {!open && (
        <>
          <WeekdayHeader />
          <Row>{weekDays(current).map((d) => cell(d))}</Row>
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
          width: "100%",
          height: tokens.touch.min,
          // The drag is ours: the browser must not take it as a scroll.
          touchAction: "none",
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

function WeekdayHeader() {
  return (
    <Row>
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
    </Row>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
      {children}
    </Box>
  );
}

function DayCell({
  date,
  dim,
  today,
  current,
  inTrip,
  hasEntries,
  enabled,
  onPick,
}: {
  date: string;
  dim: boolean;
  today: boolean;
  current: boolean;
  inTrip: boolean;
  hasEntries: boolean;
  enabled: boolean;
  onPick: () => void;
}) {
  return (
    <ButtonBase
      data-testid="week-day"
      data-date={date}
      data-today={today}
      data-current={current}
      data-has-entries={hasEntries}
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
        bgcolor: inTrip ? `${tokens.primary}${alphas.tint}` : "transparent",
        "&.Mui-disabled": { opacity: 1 },
      }}
    >
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          fontFamily: fonts.label,
          fontSize: 15,
          fontWeight: current ? 700 : 500,
          fontVariantNumeric: "tabular-nums",
          bgcolor: current ? tokens.primary : "transparent",
          color: current
            ? tokens.onPrimary
            : dim || !enabled
              ? tokens.outline
              : tokens.onSurface,
          boxShadow:
            today && !current ? `inset 0 0 0 2px ${tokens.primary}` : "none",
        }}
      >
        {Number(date.slice(8, 10))}
      </Box>
      {hasEntries && (
        <Box
          sx={{
            position: "absolute",
            bottom: 2,
            width: 4,
            height: 4,
            borderRadius: "50%",
            bgcolor: current ? tokens.primary : tokens.onSurfaceVariant,
          }}
        />
      )}
    </ButtonBase>
  );
}
