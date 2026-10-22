import DirectionsBoatOutlinedIcon from "@mui/icons-material/DirectionsBoatOutlined";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { stayKind } from "@/components/trips/stayKinds";
import { ArrivalIcon, DepartureIcon } from "@/components/trips/TripIcons";
import { descentRivers, descentTitle } from "@/lib/descents";
import { clockTime, formatTime } from "@/lib/format";
import { theme } from "@/lib/theme";
import type { TripEvent } from "@/lib/tripTimeline";

const { phone } = theme.tokens;

/** The icon column of an event line plus its gap: where the text starts, and
 * where a line without an icon has to indent to. A phone uses the grid's
 * icon column (names on the 68 line); the desktop card keeps 22 + 10. */
export const EVENT_ICON_COLUMN = {
  xs: `${phone.icon + phone.iconGap}px`,
  md: "32px",
} as const;

/** The gap between an event's icon column and its text. */
export const EVENT_GAP = { xs: `${phone.iconGap}px`, md: "10px" } as const;

/** The event's glyph in its 22px column. */
export function EventIcon({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        width: { xs: phone.icon, md: 22 },
        flexShrink: 0,
        display: "grid",
        placeItems: "center",
        height: 20,
        color: "text.disabled",
        "& svg": { fontSize: 20 },
      }}
    >
      {children}
    </Box>
  );
}

/** An event's name (15/20, medium) or what it was (13/18, secondary). */
export function EventText({
  kind,
  children,
}: {
  kind: "title" | "detail";
  children: ReactNode;
}) {
  return (
    <Typography
      sx={
        kind === "title"
          ? { fontSize: 15, lineHeight: "20px", fontWeight: 500 }
          : { fontSize: 13, lineHeight: "18px", color: "text.secondary" }
      }
    >
      {children}
    </Typography>
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
 * One thing that happened, as icon, name and what it was. Shared by the day
 * as it reads and the day as it opens, so both say the same thing.
 */
export function eventLabels(event: TripEvent): {
  icon: React.ReactNode;
  title: string;
  detail: string;
} {
  if (event.kind === "base") {
    const { Icon, label } = stayKind(event.stay.kind);
    return {
      icon: <Icon />,
      title: event.stay.name,
      detail: `Based at ${label.toLowerCase()}`,
    };
  }

  if (event.kind === "arrives" || event.kind === "leaves") {
    const arriving = event.kind === "arrives";
    return {
      icon: arriving ? <ArrivalIcon /> : <DepartureIcon />,
      title: event.member.username,
      detail: withTime(
        arriving ? "Arrives" : "Leaves",
        arriving ? event.member.arrival_time : event.member.departure_time,
      ),
    };
  }

  const { descent } = event;
  // Which river is not decoration here: the day list mixes them, and two
  // valleys can both have an "Oberlauf".
  const title = descentTitle(descent);
  const rivers = descentRivers(descent).join(" / ");

  return {
    icon: <DirectionsBoatOutlinedIcon />,
    title,
    detail: `${rivers && rivers !== title ? `${rivers} · ` : ""}Paddled by ${descent.username ?? "a member"} · ${formatTime(descent.start_time)}`,
  };
}
