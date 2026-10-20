import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import { format, parseISO } from "date-fns";
import { alphas, fonts, theme } from "@/lib/theme";

const { tokens } = theme;

interface Props {
  /** The days of the plan, in order. */
  dates: string[];
  /** Runs per day. */
  runs: Map<string, number>;
  /** The day the reader is on. */
  current: string;
  today: string;
  onPick: (date: string) => void;
}

/** The trip's days as a row of cells, each with its weekday, date and the
 * runs it holds. The desktop card's version of the plan calendar: a trip is
 * about a week, so the whole of it fits across the card. */
export default function TripWeek({
  dates,
  runs,
  current,
  today,
  onPick,
}: Props) {
  return (
    <Box
      data-testid="trip-week"
      sx={{
        display: "flex",
        gap: 0.75,
        px: 2,
        py: 1.5,
        overflowX: "auto",
        flexShrink: 0,
      }}
    >
      {dates.map((date) => {
        const count = runs.get(date) ?? 0;
        const on = date === current;
        return (
          <ButtonBase
            key={date}
            data-testid="trip-week-day"
            data-date={date}
            aria-current={on ? "date" : undefined}
            aria-label={format(parseISO(date), "EEEE d MMMM")}
            onClick={() => onPick(date)}
            sx={{
              flex: "1 1 0",
              minWidth: 40,
              minHeight: tokens.touch.min,
              flexDirection: "column",
              gap: 0.25,
              py: 1,
              borderRadius: `${tokens.radii.md}px`,
              bgcolor: on ? `${tokens.primary}${alphas.tint}` : "transparent",
              boxShadow: `inset 0 0 0 ${on ? 2 : 1}px ${
                on ? tokens.primary : tokens.outlineVariant
              }`,
              fontFamily: fonts.body,
            }}
          >
            <Typography
              component="span"
              sx={{ fontSize: 11, color: "text.secondary" }}
            >
              {format(parseISO(date), "EEE")}
            </Typography>
            <Typography
              component="span"
              sx={{
                fontSize: 17,
                fontWeight: 600,
                color: date === today ? tokens.primary : "text.primary",
              }}
            >
              {format(parseISO(date), "dd")}
            </Typography>
            <Box
              sx={{
                width: 24,
                height: 3,
                borderRadius: `${tokens.radii.pill}px`,
                bgcolor:
                  count > 0
                    ? tokens.primary
                    : `${tokens.primary}${alphas.wash}`,
              }}
            />
            <Typography
              component="span"
              sx={{
                fontSize: 10,
                minHeight: 12,
                color: tokens.primary,
              }}
            >
              {count > 0 ? `${count} ${count === 1 ? "run" : "runs"}` : ""}
            </Typography>
          </ButtonBase>
        );
      })}
    </Box>
  );
}
