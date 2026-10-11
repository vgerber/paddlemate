import DirectionsBoatOutlinedIcon from "@mui/icons-material/DirectionsBoatOutlined";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { stayKind } from "@/components/trips/stayKinds";
import { ArrivalIcon, DepartureIcon } from "@/components/trips/TripIcons";
import { clockTime, formatTime } from "@/lib/format";
import type { TripEvent } from "@/lib/tripTimeline";

/** The icon column of an event line (22px) plus its 10px gap: where the text
 * starts, and where a line without an icon has to indent to. */
export const EVENT_ICON_COLUMN = 32;

/** The event's glyph in its 22px column. */
export function EventIcon({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        width: 22,
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
  const ordered = [...descent.sections].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  const sections = ordered
    .map((s) => s.section_name)
    .filter(Boolean)
    .join(" · ");
  // Which river is not decoration here: the day list mixes them, and two
  // valleys can both have an "Oberlauf".
  const rivers = [
    ...new Set(ordered.map((s) => s.waterway_name).filter(Boolean)),
  ].join(" / ");

  return {
    icon: <DirectionsBoatOutlinedIcon />,
    title: sections || descent.name || "A descent",
    detail: `${rivers ? `${rivers} · ` : ""}Paddled by ${descent.username ?? "a member"} · ${formatTime(descent.start_time)}`,
  };
}
