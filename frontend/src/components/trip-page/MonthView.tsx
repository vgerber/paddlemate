import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import { addMonths, format } from "date-fns";
import { ChevronLeftIcon, ChevronRightIcon } from "@/lib/icons";
import { sectionHeadingSx, theme } from "@/lib/theme/theme";
import { monthGrid } from "@/lib/trips/tripTimeline";
import type { DayProps } from "./calendarTypes";
import { WeekdayHeader, WeekRow } from "./WeekRow";

const { tokens } = theme;

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
