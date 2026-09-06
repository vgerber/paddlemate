import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import { useMemo, useState } from "react";
import { factLabelSx } from "@/components/Fact";
import { fonts, theme } from "@/lib/theme";
import { monthGrid } from "@/lib/tripTimeline";

const { tokens } = theme;

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

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

function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * A month at a time, with the days that already have something on them
 * marked. Picking a day is picking a date, so it shows the shape of the
 * month rather than asking you to type one - and the marks answer "which
 * days have I already planned" without leaving the dialog.
 */
export default function DayCalendar({
  selected,
  inUse,
  from,
  to,
  onSelect,
}: Props) {
  const anchor = selected ?? from;
  const [cursor, setCursor] = useState(() => ({
    year: Number(anchor.slice(0, 4)),
    month: Number(anchor.slice(5, 7)),
  }));

  const weeks = useMemo(
    () => monthGrid(cursor.year, cursor.month),
    [cursor.year, cursor.month],
  );

  const step = (delta: number) =>
    setCursor(({ year, month }) => {
      const next = month + delta;
      if (next < 1) return { year: year - 1, month: 12 };
      if (next > 12) return { year: year + 1, month: 1 };
      return { year, month: next };
    });

  const monthPrefix = `${cursor.year}-${String(cursor.month).padStart(2, "0")}`;

  return (
    // A month is only ever seven columns wide; letting it stretch to a
    // desktop dialog turns six rows into half a screen.
    <Box sx={{ maxWidth: 340, mx: "auto", width: "100%" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
        <IconButton
          size="small"
          onClick={() => step(-1)}
          aria-label="Previous month"
        >
          <ChevronLeftIcon fontSize="small" />
        </IconButton>
        <Typography
          sx={{
            fontFamily: fonts.label,
            fontSize: "0.8125rem",
            fontWeight: 700,
            flex: 1,
            textAlign: "center",
          }}
        >
          {monthLabel(cursor.year, cursor.month)}
        </Typography>
        <IconButton
          size="small"
          onClick={() => step(1)}
          aria-label="Next month"
        >
          <ChevronRightIcon fontSize="small" />
        </IconButton>
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: "2px",
        }}
      >
        {WEEKDAYS.map((day) => (
          <Typography
            key={day}
            sx={{ ...factLabelSx, textAlign: "center", pb: 0.5 }}
          >
            {day}
          </Typography>
        ))}

        {weeks.flat().map((date) => (
          <DayCell
            key={date}
            date={date}
            outsideMonth={!date.startsWith(monthPrefix)}
            inTrip={date >= from && (to === null || date <= to)}
            inUse={inUse.has(date)}
            selected={date === selected}
            onSelect={() => onSelect(date)}
          />
        ))}
      </Box>
    </Box>
  );
}

function DayCell({
  date,
  outsideMonth,
  inTrip,
  inUse,
  selected,
  onSelect,
}: {
  date: string;
  outsideMonth: boolean;
  inTrip: boolean;
  inUse: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <ButtonBase
      onClick={onSelect}
      aria-label={date}
      aria-pressed={selected}
      sx={{
        height: 38,
        flexDirection: "column",
        gap: "1px",
        border: "1px solid",
        borderColor: selected ? tokens.tertiary : "transparent",
        // The trip's own days sit on a lighter ground so the span is visible
        // without colour; days outside it stay selectable for an early start.
        bgcolor: selected
          ? `${tokens.tertiary}14`
          : inTrip
            ? tokens.surfaceHigh
            : "transparent",
        opacity: outsideMonth ? 0.4 : 1,
        "&:hover": { bgcolor: `${tokens.primary}1f` },
      }}
    >
      <Typography
        sx={{
          fontFamily: fonts.label,
          fontSize: "0.75rem",
          color: selected ? tokens.tertiary : "text.primary",
        }}
      >
        {Number(date.slice(8, 10))}
      </Typography>
      {/* A day already carrying something gets a dot, so "which days have I
          planned" is answerable at a glance. */}
      <Box
        sx={{
          width: 4,
          height: 4,
          borderRadius: "50%",
          bgcolor: inUse ? tokens.primary : "transparent",
        }}
      />
    </ButtonBase>
  );
}
