import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import { parseISO, startOfMonth } from "date-fns";
import { useState } from "react";
import { withAlpha } from "@/lib/theme/alpha";
import { theme } from "@/lib/theme/theme";
import {
  HANDLE_BLOCK,
  MONTH_SCRIM,
  MONTH_SCRIM_DARK,
  OVERHANG,
  STRIP_PAD,
} from "./calendarSizes";
import { MonthView } from "./MonthView";
import { useMonthPull } from "./useMonthPull";
import { WeekdayHeader } from "./WeekRow";
import { WeekSlider } from "./WeekSlider";

const { tokens } = theme;

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

export { MonthView };
