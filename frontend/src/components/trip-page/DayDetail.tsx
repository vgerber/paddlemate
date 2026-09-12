import DirectionsBoatOutlinedIcon from "@mui/icons-material/DirectionsBoatOutlined";
import FlightLandOutlinedIcon from "@mui/icons-material/FlightLandOutlined";
import FlightTakeoffOutlinedIcon from "@mui/icons-material/FlightTakeoffOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import Box from "@mui/material/Box";
import ListItemButton from "@mui/material/ListItemButton";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { factLabelSx } from "@/components/Fact";
import FormSection from "@/components/waterway/FormSection";
import type { Descent, TripMember, TripStay } from "@/lib/api";
import { theme } from "@/lib/theme";
import type { TripDay, TripEvent } from "@/lib/tripTimeline";
import { eventKey, eventLabels } from "./eventLabels";

/** What a day lets you reach. Only what this viewer may do is shown. */
export interface DayActions {
  self: TripMember | null;
  viewerId: string | null;
  /** A viewer who has not joined reads the day; they do not add to it. */
  canEdit: boolean;
  onEditStay: (stay: TripStay) => void;
  onEditAttendance: (
    member: TripMember,
    preset?: { arrival?: string; departure?: string },
  ) => void;
  onOpenLog: (descent: Descent) => void;
  onAddStay: (date: string) => void;
  onNewLog: () => void;
}

/**
 * The inside of a day, shown where the day sits rather than over it: what is
 * on it, each row going to the thing behind it, and the ways to put something
 * new on it - which is all "adding a day" ever means, since a day with
 * nothing on it does not exist.
 */
export default function DayDetail({
  day,
  actions,
}: {
  day: TripDay;
  actions: DayActions;
}) {
  return (
    // The day above is a click target; acting in here is not clicking it.
    <Box
      onClick={(e) => e.stopPropagation()}
      sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1.5, pb: 1 }}
    >
      <FormSection label="On this day">
        {day.events.length === 0 ? (
          <Typography variant="body2" color="text.disabled">
            Nothing on this day yet.
          </Typography>
        ) : (
          <Box>
            {day.events.map((event) => (
              <EntryRow key={eventKey(event)} event={event} actions={actions} />
            ))}
          </Box>
        )}
      </FormSection>

      {actions.canEdit && (
        <FormSection
          label="Add to this day"
          hint="The day is filled in for you."
        >
          <Box>
            {actions.self && (
              <AddRow
                icon={<FlightLandOutlinedIcon fontSize="small" />}
                label="I arrive this day"
                onClick={() =>
                  actions.onEditAttendance(actions.self as TripMember, {
                    arrival: day.date,
                  })
                }
              />
            )}
            {actions.self && (
              <AddRow
                icon={<FlightTakeoffOutlinedIcon fontSize="small" />}
                label="I leave this day"
                onClick={() =>
                  actions.onEditAttendance(actions.self as TripMember, {
                    departure: day.date,
                  })
                }
              />
            )}
            <AddRow
              icon={<PlaceOutlinedIcon fontSize="small" />}
              label="Base the group here"
              onClick={() => actions.onAddStay(day.date)}
            />
            <AddRow
              icon={<DirectionsBoatOutlinedIcon fontSize="small" />}
              label="Log a descent"
              onClick={actions.onNewLog}
            />
          </Box>
        </FormSection>
      )}
    </Box>
  );
}

/** Where an entry goes when you tap it, or null when it is not yours to move. */
function entryTarget(
  event: TripEvent,
  actions: DayActions,
): (() => void) | null {
  if (event.kind === "base") return () => actions.onEditStay(event.stay);
  if (event.kind === "paddled") return () => actions.onOpenLog(event.descent);
  // Attendance is the member's own record, so only they can move it.
  if (event.member.user_id !== actions.viewerId) return null;
  return () => actions.onEditAttendance(event.member);
}

function EntryRow({
  event,
  actions,
}: {
  event: TripEvent;
  actions: DayActions;
}) {
  const { icon, title, detail } = eventLabels(event);
  const target = entryTarget(event, actions);

  return (
    <Row icon={icon} onClick={target ?? undefined}>
      <Typography variant="body2">{title}</Typography>
      <Typography sx={factLabelSx}>{detail}</Typography>
    </Row>
  );
}

function AddRow({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Row icon={icon} onClick={onClick}>
      <Typography variant="body2">{label}</Typography>
    </Row>
  );
}

function Row({
  icon,
  onClick,
  children,
}: {
  icon: ReactNode;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <ListItemButton
      onClick={onClick}
      disabled={!onClick}
      sx={{
        display: "flex",
        alignItems: "flex-start",
        gap: 1.5,
        px: 1,
        py: 1,
        borderBottom: "1px solid",
        borderColor: `${theme.tokens.outlineVariant}55`,
        // A row nobody may act on still has to read normally.
        "&.Mui-disabled": { opacity: 1 },
      }}
    >
      <Box sx={{ color: "text.disabled", pt: "2px", flexShrink: 0 }}>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>{children}</Box>
    </ListItemButton>
  );
}
