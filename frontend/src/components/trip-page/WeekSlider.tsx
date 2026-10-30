import Box from "@mui/material/Box";
import { useState } from "react";
import type { DayProps } from "./calendarTypes";
import { weekDays } from "./planWeek";
import { useWeekPaneMotion } from "./useWeekMotion";
import { WeekRow } from "./WeekRow";

/** The week row, swapping weeks by sliding one week sideways in the direction
 * of travel; the old row slides out beside the new one. Reduced motion
 * cross-fades the two rows instead. */
export function WeekSlider({
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
  const ref = useWeekPaneMotion(mode, dir, onDone);
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
