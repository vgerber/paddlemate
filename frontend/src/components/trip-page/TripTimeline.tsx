import DirectionsBoatOutlinedIcon from "@mui/icons-material/DirectionsBoatOutlined";
import EventNoteOutlinedIcon from "@mui/icons-material/EventNoteOutlined";
import FlightLandOutlinedIcon from "@mui/icons-material/FlightLandOutlined";
import FlightTakeoffOutlinedIcon from "@mui/icons-material/FlightTakeoffOutlined";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { factLabelSx } from "@/components/Fact";
import EmptyState from "@/components/states/EmptyState";
import LoadingBox from "@/components/states/LoadingBox";
import TimelineRail from "@/components/TimelineRail";
import { stayKind } from "@/components/trips/stayKinds";
import type { Trip } from "@/lib/api";
import { clockTime, formatDate, formatTime } from "@/lib/format";
import { useTripTimeline } from "@/lib/hooks/useTrips";
import { fonts, theme } from "@/lib/theme";
import {
  type PaddledRiver,
  paddledByRiver,
  type TripDay,
  type TripEvent,
} from "@/lib/tripTimeline";

const { tokens } = theme;

/**
 * The trip as it runs: one entry per day something happens, with who turned
 * up, where the group was based and what got paddled. Days before the start
 * count backwards, so an early arrival reads as Day -1.
 *
 * A day is the unit you act on - open one to edit what is on it. A control on
 * every line turned a plan you read into a column of buttons.
 */
export default function TripTimeline({
  trip,
  onOpenDay,
}: {
  trip: Trip;
  onOpenDay: (day: TripDay) => void;
}) {
  const { days, isLoading } = useTripTimeline(trip);

  if (isLoading) return <LoadingBox size={40} pt={6} />;

  if (days.length === 0) {
    return (
      <EmptyState
        icon={
          <EventNoteOutlinedIcon
            sx={{ fontSize: 48, color: "text.disabled" }}
          />
        }
        title="Nothing on the plan yet."
        caption="Add a day to say when you arrive, where you are based, or what you paddled."
        py={6}
      />
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <Stack direction="column">
      {days.map((day, idx) => (
        <DayEntry
          key={day.date}
          day={day}
          isLast={idx === days.length - 1}
          today={today}
          onOpen={() => onOpenDay(day)}
        />
      ))}
    </Stack>
  );
}

function DayEntry({
  day,
  isLast,
  today,
  onOpen,
}: {
  day: TripDay;
  isLast: boolean;
  today: string;
  onOpen: () => void;
}) {
  // A day still ahead is a plan, not a record - the hollow dot says so.
  const planned = day.date > today;
  const plans = day.events.filter((e) => e.kind !== "paddled");
  const { rivers, unsectioned } = paddledByRiver(day.events);

  return (
    <ButtonBase
      component="div"
      disableRipple
      onClick={onOpen}
      aria-label={`Day ${day.day}, ${formatDate(day.date)}`}
      sx={{
        display: "flex",
        gap: "10px",
        px: "6px",
        width: "100%",
        alignItems: "flex-start",
        textAlign: "left",
        cursor: "pointer",
        "&:hover": { bgcolor: "action.hover" },
      }}
    >
      <TimelineRail isLast={isLast} hollow={planned} />
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          pt: "4px",
          pb: isLast ? "8px" : "20px",
        }}
      >
        <Stack direction="row" sx={{ alignItems: "baseline", gap: 1 }}>
          <Typography
            component="span"
            sx={{
              fontFamily: fonts.label,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              color: planned ? tokens.onSurfaceVariant : tokens.primary,
              opacity: planned ? 0.7 : 1,
              lineHeight: 1.25,
              flex: 1,
            }}
          >
            Day {day.day}
          </Typography>
          <Typography
            component="span"
            sx={{
              fontFamily: fonts.mono,
              fontSize: 12,
              color: tokens.outline,
              flexShrink: 0,
            }}
          >
            {formatDate(day.date, { weekday: true })}
          </Typography>
        </Stack>

        <Stack direction="column" sx={{ gap: 0.75, mt: 0.75 }}>
          {/* A day with nothing on it is still a day of the trip - and the
              place you go to put something on it. */}
          {day.events.length === 0 && (
            <Typography sx={factLabelSx}>Rest</Typography>
          )}

          {plans.map((event) => {
            const { icon, title, detail } = eventLabels(event);
            return (
              <EventLine
                key={eventKey(event)}
                icon={icon}
                title={title}
                detail={detail}
              />
            );
          })}

          {/* What went that day, by river - two people on one stretch is one
              line with both names, not the same stretch twice. */}
          {rivers.map((river) => (
            <RiverLine key={river.waterwayId ?? river.name} river={river} />
          ))}

          {unsectioned.map((descent) => (
            <EventLine
              key={`paddled-${descent.id}`}
              icon={<DirectionsBoatOutlinedIcon sx={{ fontSize: 14 }} />}
              title={descent.name ?? "A descent"}
              detail={`Paddled by ${descent.username ?? "a member"}`}
            />
          ))}
        </Stack>
      </Box>
    </ButtonBase>
  );
}

function RiverLine({ river }: { river: PaddledRiver }) {
  return (
    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
      <Box sx={{ color: "text.disabled", pt: "2px", flexShrink: 0 }}>
        <DirectionsBoatOutlinedIcon sx={{ fontSize: 14 }} />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2">{river.name}</Typography>
        {river.sections.map((section) => (
          <Typography key={section.sectionId} sx={factLabelSx}>
            {section.name} · {section.paddlers.join(", ")}
          </Typography>
        ))}
      </Box>
    </Box>
  );
}

function EventLine({
  icon,
  title,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
      <Box sx={{ color: "text.disabled", pt: "2px", flexShrink: 0 }}>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2">{title}</Typography>
        <Typography sx={factLabelSx}>{detail}</Typography>
      </Box>
    </Box>
  );
}

export function eventKey(event: TripEvent): string {
  switch (event.kind) {
    case "base":
      return `base-${event.stay.id}`;
    case "paddled":
      return `paddled-${event.descent.id}`;
    default:
      return `${event.kind}-${event.member.user_id}`;
  }
}

/** "Arrives · 19:30" once the hour is known, plain "Arrives" until then. */
function withTime(label: string, time?: string | null): string {
  return time ? `${label} · ${clockTime(time)}` : label;
}

/**
 * One thing that happened, as icon, name and what it was. Shared by the
 * timeline and the day editor, so a day reads the same in both.
 */
export function eventLabels(event: TripEvent): {
  icon: React.ReactNode;
  title: string;
  detail: string;
} {
  if (event.kind === "base") {
    const { Icon, label } = stayKind(event.stay.kind);
    return {
      icon: <Icon sx={{ fontSize: 14 }} />,
      title: event.stay.name,
      detail: `Based at ${label}`,
    };
  }

  if (event.kind === "arrives" || event.kind === "leaves") {
    const arriving = event.kind === "arrives";
    return {
      icon: arriving ? (
        <FlightLandOutlinedIcon sx={{ fontSize: 14 }} />
      ) : (
        <FlightTakeoffOutlinedIcon sx={{ fontSize: 14 }} />
      ),
      title: event.member.username,
      detail: withTime(
        arriving ? "Arrives" : "Leaves",
        arriving ? event.member.arrival_time : event.member.departure_time,
      ),
    };
  }

  const { descent } = event;
  const sections = [...descent.sections]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => s.section_name)
    .filter(Boolean)
    .join(" · ");

  return {
    icon: <DirectionsBoatOutlinedIcon sx={{ fontSize: 14 }} />,
    title: sections || descent.name || "A descent",
    detail: `Paddled by ${descent.username ?? "a member"} · ${formatTime(descent.start_time)}`,
  };
}
