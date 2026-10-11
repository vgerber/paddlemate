import Box from "@mui/material/Box";
import { parseISO, startOfMonth } from "date-fns";
import { useState } from "react";
import { todayIso } from "@/lib/format";
import { MonthView } from "./PlanCalendar";

interface Props {
  /** The day currently open, if any. */
  selected: string | null;
  /** Days that already have something on them. */
  inUse: Set<string>;
  /** The trip's own span, shaded so its days read as part of it. */
  from: string;
  to: string | null;
  onSelect: (date: string) => void;
}

/**
 * A month at a time, with the days that already have something on them
 * marked. It draws the plan's own month, so picking a day looks like the
 * calendar the day will open in.
 */
export default function DayCalendar({
  selected,
  inUse,
  from,
  to,
  onSelect,
}: Props) {
  // The first of the month on show.
  const [cursor, setCursor] = useState(() =>
    startOfMonth(parseISO(selected ?? from)),
  );

  return (
    // A month is only ever seven columns wide; letting it stretch to a
    // desktop dialog turns six rows into half a screen.
    <Box sx={{ maxWidth: 340, mx: "auto", width: "100%" }}>
      <MonthView
        cursor={cursor}
        onCursorChange={setCursor}
        today={todayIso()}
        current={selected}
        from={from}
        to={to}
        withEntries={inUse}
        planned={null}
        onPick={onSelect}
      />
    </Box>
  );
}
