import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import { addMonths, format, parseISO, startOfMonth } from "date-fns";
import { useEffect, useRef, useState } from "react";
import { withAlpha } from "@/lib/alpha";
import { ChevronLeftIcon, ChevronRightIcon } from "@/lib/icons";
import {
  css,
  durations,
  prefersReducedMotion,
  REDUCED_FADE_MS,
  useReducedMotion,
} from "@/lib/motion";
import { fonts, sectionHeadingSx, theme } from "@/lib/theme";
import { monthGrid } from "@/lib/tripTimeline";
import { weekDays } from "./planWeek";
import { useMonthPull } from "./useMonthPull";

const { tokens } = theme;

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const DISC = 36;
const BAND_INSET = 4;
const GRABBER = 16;
/** What the 44px button reaches beyond a 16px strip, per side. */
const OVERHANG = (tokens.touch.min - GRABBER) / 2;
const MARK = 5;
const MARK_GAP = 3;
// What the handle button adds below the week: its height less the overhang it
// shares with its neighbours (see the button's margins).
const HANDLE_BLOCK = tokens.touch.min + 8 - OVERHANG + (6 - OVERHANG);

// Ink behind the month, over the list.
const MONTH_SCRIM = 18;
const MONTH_SCRIM_DARK = 50;

// Seven columns, the first disc's left edge on the 28 line and the last
// one's right edge on the right line: the disc centre of column one sits at
// line + DISC / 2, which solves to this padding (a percentage is of the
// strip's width). Capped so seven 44px hit cells still fit at 320.
const STRIP_PAD = `min(calc((${tokens.phone.line + DISC / 2}px - 100% / 14) * 7 / 6), calc(50% - ${(7 * tokens.touch.min) / 2}px))`;

interface Props {
  /** The day the reader is on; its week is the one shown. */
  current: string;
  /** The day whose week the strip shows until the reader moves. */
  weekOf?: string;
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
  weekOf,
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
  const pull = useMonthPull({
    open,
    onOpenChange,
    onPullStart: () => setCursor(startOfMonth(parseISO(current))),
  });

  const pick = (date: string) => {
    onOpenChange(false);
    onPick(date);
  };

  const days = { today, current, from, to, runs, planned, onPick: pick };

  return (
    <>
      {pull.mounted && (
        <Box
          ref={pull.scrimRef}
          data-testid="month-scrim"
          // Keeps its own short fade under reduced motion.
          data-reduced-fade
          onClick={() => onOpenChange(false)}
          sx={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            opacity: 0,
            // Ink in light, black in dark: onSurface would lighten the page.
            bgcolor: withAlpha(tokens.scrimBase, MONTH_SCRIM),
            '[data-theme="dark"] &': {
              bgcolor: withAlpha(tokens.scrimBase, MONTH_SCRIM_DARK),
            },
          }}
        />
      )}
      <Box
        ref={pull.rootRef}
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
        {pull.mounted && (
          <Box
            ref={pull.panelRef}
            data-testid="month-panel"
            data-reduced-fade
            sx={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              zIndex: 1,
              bgcolor: tokens.surface,
              pt: 0.75,
              px: STRIP_PAD,
              pb: `${HANDLE_BLOCK}px`,
            }}
          >
            <MonthView cursor={cursor} onCursorChange={setCursor} {...days} />
          </Box>
        )}

        <Box sx={{ visibility: open ? "hidden" : "visible" }}>
          <WeekdayHeader />
          <WeekSlider week={weekOf ?? current} open={open} {...days} />
        </Box>

        <ButtonBase
          ref={pull.handleRef}
          aria-label={open ? "Show the week" : "Show the month"}
          aria-expanded={open}
          {...pull.handlers}
          // Keyboard activation has no pointer; it arrives as a click with no
          // detail.
          onClick={(e) => {
            if (e.detail === 0) {
              if (!open) setCursor(startOfMonth(parseISO(current)));
              onOpenChange(!open);
            }
          }}
          sx={{
            position: "relative",
            zIndex: 2,
            width: "100%",
            // The bar is 4px; the button is a full touch target. Negative
            // margins give the extra back to the neighbours, so the strip keeps
            // its height and the button's reach overlaps them as before.
            height: tokens.touch.min,
            mt: `${8 - OVERHANG}px`,
            mb: `${6 - OVERHANG}px`,
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
    </>
  );
}

/** The week row, swapping weeks by sliding one week sideways in the direction
 * of travel; the old row slides out beside the new one. Reduced motion
 * cross-fades the two rows instead. */
function WeekSlider({
  week,
  open,
  ...days
}: DayProps & { week: string; open: boolean }) {
  const monday = weekDays(week)[0] ?? week;
  // The week and day as last drawn: the old row keeps its disc while it leaves.
  const [shown, setShown] = useState({ monday, current: days.current });
  const [leaving, setLeaving] = useState<{
    monday: string;
    current: string | null;
    dir: 1 | -1;
  } | null>(null);
  if (monday !== shown.monday) {
    setLeaving(open ? null : { ...shown, dir: monday > shown.monday ? 1 : -1 });
    setShown({ monday, current: days.current });
  } else if (days.current !== shown.current) {
    setShown({ monday, current: days.current });
  }
  return (
    <Box
      data-testid="week-stage"
      sx={{ position: "relative", overflow: "hidden" }}
    >
      {leaving && (
        <WeekPane
          key={`out-${leaving.monday}`}
          mode="out"
          dir={leaving.dir}
          dates={weekDays(leaving.monday)}
          onDone={() => setLeaving(null)}
          {...days}
          current={leaving.current}
        />
      )}
      <WeekPane
        key={monday}
        mode={leaving ? "in" : "rest"}
        dir={leaving?.dir ?? 1}
        dates={weekDays(monday)}
        {...days}
      />
    </Box>
  );
}

function WeekPane({
  mode,
  dir,
  onDone,
  dates,
  ...days
}: DayProps & {
  mode: "rest" | "in" | "out";
  dir: 1 | -1;
  dates: string[];
  onDone?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // The mode and direction only matter at mount, when the pane arrives.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount only
  useEffect(() => {
    const el = ref.current;
    if (!el || mode === "rest") return;
    const reduced = prefersReducedMotion();
    const enter = mode === "in";
    const slide = `${enter ? dir * 100 : 0}%`;
    const away = `${enter ? 0 : -dir * 100}%`;
    const anim = reduced
      ? el.animate(
          { opacity: enter ? [0, 1] : [1, 0] },
          {
            duration: REDUCED_FADE_MS,
            fill: enter ? "backwards" : "forwards",
          },
        )
      : el.animate(
          {
            transform: enter
              ? [`translateX(${slide})`, "translateX(0)"]
              : ["translateX(0)", `translateX(${away})`],
          },
          {
            duration: durations.base,
            easing: css.easeInOut,
            fill: enter ? "backwards" : "forwards",
          },
        );
    anim.onfinish = () => onDone?.();
    return () => anim.cancel();
  }, []);
  return (
    <Box
      ref={ref}
      data-testid="week-pane"
      data-mode={mode}
      // The leaving week is a picture: out of the tab order and a11y tree.
      inert={mode === "out" || undefined}
      aria-hidden={mode === "out" || undefined}
      sx={mode === "out" ? { position: "absolute", inset: "0 0 auto 0" } : {}}
    >
      <WeekRow dates={dates} discFade={mode} {...days} />
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
        data-pr="title"
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
        <Typography component="h3" sx={sectionHeadingSx}>
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
      <Box data-pr="body">
        <WeekdayHeader />
        {monthGrid(cursor.getFullYear(), cursor.getMonth() + 1).map((week) => (
          <Box
            key={week[0]}
            data-pr="week"
            data-has-current={
              days.current !== null && week.includes(days.current)
            }
          >
            <WeekRow
              dates={week}
              dimmed={(d) => !d.startsWith(monthPrefix)}
              {...days}
            />
          </Box>
        ))}
      </Box>
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
  const ref = useRef<HTMLDivElement>(null);
  // The fade only matters when the disc arrives.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount only
  useEffect(() => {
    const el = ref.current;
    if (!el || fade === "rest") return;
    const reduced = prefersReducedMotion();
    const anim = el.animate(
      { opacity: fade === "in" ? [0, 1] : [1, 0] },
      {
        duration: reduced ? REDUCED_FADE_MS : durations.fast,
        easing: fade === "in" ? css.easeOut : css.easeIn,
        fill: fade === "in" ? "backwards" : "forwards",
      },
    );
    anim.onfinish = () => onDone?.();
    return () => anim.cancel();
  }, []);
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
