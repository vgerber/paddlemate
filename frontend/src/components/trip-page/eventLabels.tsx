import DirectionsBoatOutlinedIcon from "@mui/icons-material/DirectionsBoatOutlined";
import FlightLandOutlinedIcon from "@mui/icons-material/FlightLandOutlined";
import FlightTakeoffOutlinedIcon from "@mui/icons-material/FlightTakeoffOutlined";
import { stayKind } from "@/components/trips/stayKinds";
import { clockTime, formatTime } from "@/lib/format";
import type { TripEvent } from "@/lib/tripTimeline";

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
    icon: <DirectionsBoatOutlinedIcon sx={{ fontSize: 14 }} />,
    title: sections || descent.name || "A descent",
    detail: `${rivers ? `${rivers} · ` : ""}Paddled by ${descent.username ?? "a member"} · ${formatTime(descent.start_time)}`,
  };
}
