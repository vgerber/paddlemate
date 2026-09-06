import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import DirectionsBoatOutlinedIcon from "@mui/icons-material/DirectionsBoatOutlined";
import FlightLandOutlinedIcon from "@mui/icons-material/FlightLandOutlined";
import FlightTakeoffOutlinedIcon from "@mui/icons-material/FlightTakeoffOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Collapse from "@mui/material/Collapse";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import ListItemButton from "@mui/material/ListItemButton";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { type ReactNode, useMemo, useState } from "react";
import { factLabelSx } from "@/components/Fact";
import FormSection from "@/components/waterway/FormSection";
import type { Descent, Trip, TripMember, TripStay } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useTripTimeline } from "@/lib/hooks/useTrips";
import { theme } from "@/lib/theme";
import { dayNumber, type TripEvent } from "@/lib/tripTimeline";
import DayCalendar from "./DayCalendar";
import { eventKey, eventLabels } from "./TripTimeline";

/** What a day lets you reach. The dialog only shows what this viewer may do. */
export interface DayActions {
  self: TripMember | null;
  viewerId: string | null;
  onEditStay: (stay: TripStay) => void;
  onEditAttendance: (
    member: TripMember,
    preset?: { arrival?: string; departure?: string },
  ) => void;
  onOpenLog: (descent: Descent) => void;
  onAddStay: (date: string) => void;
  onNewLog: () => void;
}

interface Props {
  trip: Trip;
  /** Fixed when opened from the timeline; chosen here when adding a day. */
  date: string | null;
  actions: DayActions;
  open: boolean;
  onClose: () => void;
}

/**
 * One day of the trip, opened from the timeline or started from scratch.
 * Everything on that day is listed, each row going to the thing behind it,
 * and below them the ways to put something new on the day - which is all
 * "adding a day" ever means, since a day with nothing on it does not exist.
 */
export default function DayDialog({
  trip,
  date,
  actions,
  open,
  onClose,
}: Props) {
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  const [chosen, setChosen] = useState(date ?? "");
  // Adding a day opens on the calendar, because picking one is the first
  // decision; opening a day does not, because you already made it.
  const [pickerOpen, setPickerOpen] = useState(date === null);
  const { days } = useTripTimeline(trip);

  const day = chosen ? days.find((d) => d.date === chosen) : undefined;
  const events = day?.events ?? [];
  const inUse = useMemo(
    () => new Set(days.filter((d) => d.events.length > 0).map((d) => d.date)),
    [days],
  );

  // Acting on a day sends you to an editor, so the day itself steps aside.
  const go = (act: () => void) => () => {
    onClose();
    act();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      fullScreen={fullScreen}
    >
      <DialogTitle>
        {chosen ? `Day ${dayNumber(chosen, trip.start_date)}` : "Add a day"}
      </DialogTitle>
      <DialogContent
        sx={{ display: "flex", flexDirection: "column", gap: 3, pt: 1 }}
      >
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography sx={{ ...factLabelSx, flex: 1 }}>
              {chosen ? formatDate(chosen, { weekday: true }) : "Which day"}
            </Typography>
            <Button
              size="small"
              startIcon={<CalendarMonthOutlinedIcon fontSize="small" />}
              onClick={() => setPickerOpen((v) => !v)}
            >
              {pickerOpen ? "Done" : "Change day"}
            </Button>
          </Box>
          {/* The day you opened is what you came for, so the picker stays out
              of the way until you want another one. */}
          <Collapse in={pickerOpen} timeout={200} unmountOnExit>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", pb: 1 }}
            >
              A dot marks a day that already has something on it. Any day works,
              including before the trip starts.
            </Typography>
            <DayCalendar
              selected={chosen || null}
              inUse={inUse}
              from={trip.start_date}
              to={trip.end_date ?? null}
              onSelect={(date) => {
                setChosen(date);
                setPickerOpen(false);
              }}
            />
          </Collapse>
        </Box>

        {chosen && (
          <>
            <FormSection label="On this day">
              {events.length === 0 ? (
                <Typography variant="body2" color="text.disabled">
                  Nothing on this day yet.
                </Typography>
              ) : (
                <Box>
                  {events.map((event) => (
                    <EntryRow
                      key={eventKey(event)}
                      event={event}
                      actions={actions}
                      onGo={go}
                    />
                  ))}
                </Box>
              )}
            </FormSection>

            <FormSection
              label="Add to this day"
              hint="The day is filled in for you."
            >
              <Box>
                {actions.self && (
                  <AddRow
                    icon={<FlightLandOutlinedIcon fontSize="small" />}
                    label="I arrive this day"
                    onClick={go(() =>
                      actions.onEditAttendance(actions.self as TripMember, {
                        arrival: chosen,
                      }),
                    )}
                  />
                )}
                {actions.self && (
                  <AddRow
                    icon={<FlightTakeoffOutlinedIcon fontSize="small" />}
                    label="I leave this day"
                    onClick={go(() =>
                      actions.onEditAttendance(actions.self as TripMember, {
                        departure: chosen,
                      }),
                    )}
                  />
                )}
                <AddRow
                  icon={<PlaceOutlinedIcon fontSize="small" />}
                  label="Base the group here"
                  onClick={go(() => actions.onAddStay(chosen))}
                />
                <AddRow
                  icon={<DirectionsBoatOutlinedIcon fontSize="small" />}
                  label="Log a descent"
                  onClick={go(actions.onNewLog)}
                />
              </Box>
            </FormSection>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

/** Where an entry goes when you tap it, or null when it is not yours to move. */
function entryTarget(
  event: TripEvent,
  actions: DayActions,
): (() => void) | null {
  if (event.kind === "base") return () => actions.onEditStay(event.stay);
  if (event.kind === "paddled") {
    return () => actions.onOpenLog(event.descent);
  }
  // Attendance is the member's own record, so only they can move it.
  if (event.member.user_id !== actions.viewerId) return null;
  return () => actions.onEditAttendance(event.member);
}

function EntryRow({
  event,
  actions,
  onGo,
}: {
  event: TripEvent;
  actions: DayActions;
  onGo: (act: () => void) => () => void;
}) {
  const { icon, title, detail } = eventLabels(event);
  const target = entryTarget(event, actions);

  return (
    <Row icon={icon} onClick={target ? onGo(target) : undefined}>
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
