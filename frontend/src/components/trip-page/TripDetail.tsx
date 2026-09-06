import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import EditCalendarOutlinedIcon from "@mui/icons-material/EditCalendarOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import LinkOutlinedIcon from "@mui/icons-material/LinkOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import Box from "@mui/material/Box";
import Fab from "@mui/material/Fab";
import SpeedDial from "@mui/material/SpeedDial";
import SpeedDialAction from "@mui/material/SpeedDialAction";
import SpeedDialIcon from "@mui/material/SpeedDialIcon";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import PanelHeader from "@/components/PanelHeader";
import TripForm from "@/components/trips/TripForm";
import type { Descent, Trip, TripMember, TripStay } from "@/lib/api";
import { dateRange } from "@/lib/format";
import { useSession } from "@/lib/hooks/useSession";
import {
  useDeleteTrip,
  useDeleteTripStay,
  useJoinTrip,
  useLinkDescentToTrip,
  useTripMembers,
} from "@/lib/hooks/useTrips";
import AttendanceDialog from "./AttendanceDialog";
import DayDialog from "./DayDialog";
import LinkDescentDialog from "./LinkDescentDialog";
import StayDialog from "./StayDialog";
import StaySectionsDialog from "./StaySectionsDialog";
import TripLogs from "./TripLogs";
import TripMembers from "./TripMembers";
import TripStays from "./TripStays";
import TripTimeline from "./TripTimeline";

const TABS = [
  { value: "plan", label: "Plan" },
  { value: "bases", label: "Bases" },
  { value: "members", label: "Members" },
  { value: "logs", label: "Logs" },
] as const;

export type TripTab = (typeof TABS)[number]["value"];

interface Props {
  trip: Trip;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  /** Leaving the trip: back on mobile, deselect in the desktop two-pane. */
  onClose: () => void;
  onDeleted: () => void;
}

/**
 * One trip, whole. Rendered as the mobile overlay and as the desktop detail
 * pane, so both show the same thing in the same order.
 *
 * It owns every editor the trip has, because the same base, the same
 * attendance and the same log are reachable from two places - the timeline
 * and the tab that lists them - and two owners would mean two copies.
 */
export default function TripDetail({
  trip,
  editing,
  onEditingChange,
  onClose,
  onDeleted,
}: Props) {
  const navigate = useNavigate();
  const { user } = useSession();
  const { data: members } = useTripMembers(trip.id);
  const deleteTrip = useDeleteTrip();
  const deleteStay = useDeleteTripStay(trip.id);
  const linkDescent = useLinkDescentToTrip(trip.id);
  const joinTrip = useJoinTrip(trip.id);

  const [tab, setTab] = useState<TripTab>("plan");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [linking, setLinking] = useState(false);
  // "new" adds a base; a date adds one starting that day; a stay edits it.
  const [stayEditor, setStayEditor] = useState<
    TripStay | "new" | { arrival: string } | null
  >(null);
  const [watchListFor, setWatchListFor] = useState<TripStay | null>(null);
  const [confirmDeleteStay, setConfirmDeleteStay] = useState<TripStay | null>(
    null,
  );
  const [attendanceFor, setAttendanceFor] = useState<{
    member: TripMember;
    preset?: { arrival?: string; departure?: string };
  } | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState<Descent | null>(null);
  // A string opens that day; "new" asks which day to add to.
  const [dayEditor, setDayEditor] = useState<string | "new" | null>(null);

  const isMember = trip.viewer_role != null;
  const isAdmin = trip.viewer_role === "admin";
  const viewerId = user?.id ?? null;
  const self = members?.find((m) => m.user_id === viewerId) ?? null;

  if (editing) {
    return (
      <TripForm
        trip={trip}
        onSave={() => onEditingChange(false)}
        onCancel={() => onEditingChange(false)}
      />
    );
  }

  const newLog = (sectionId?: number, waterwayId?: number) =>
    navigate({
      to: "/logs/new",
      search: { waterwayId, sectionId, tripId: trip.id },
    });

  const openLog = (descent: Descent) =>
    navigate({
      to: "/logs/$descentId",
      params: { descentId: String(descent.id) },
      search: { edit: false },
    });

  const copyLog = (descent: Descent) =>
    navigate({
      to: "/logs/new",
      search: { tripId: trip.id, copyDescentId: descent.id },
    });

  const stayActions = {
    onEditStay: setStayEditor,
    onEditWatchList: setWatchListFor,
    onDeleteStay: setConfirmDeleteStay,
  };

  return (
    <>
      <PanelHeader
        title={trip.name}
        subtitle={dateRange(trip.start_date, trip.end_date)}
        onBack={onClose}
        tabs={{
          value: tab,
          onChange: setTab,
          options: TABS.map((t) => ({ value: t.value, label: t.label })),
        }}
      />

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          // Overscroll at the list edge must not chain into a document
          // bounce - that drags the fixed mobile overlay.
          overscrollBehavior: "contain",
          // The panel holds the rows off its edges so a hovered row reads as
          // a band inside the panel rather than a stripe across it; the row
          // then supplies its own inset for the text.
          px: 2,
          py: 1,
          // Leave room so the FAB never covers the last row.
          pb: 12,
        }}
      >
        {tab === "plan" && (
          <TripTimeline
            trip={trip}
            onOpenDay={(day) => isMember && setDayEditor(day.date)}
          />
        )}
        {tab === "bases" && (
          <TripStays
            tripId={trip.id}
            isMember={isMember}
            isAdmin={isAdmin}
            onLogSection={newLog}
            {...stayActions}
          />
        )}
        {tab === "members" && (
          <TripMembers
            tripId={trip.id}
            viewerId={viewerId}
            isAdmin={isAdmin}
            onEditAttendance={(member) => setAttendanceFor({ member })}
          />
        )}
        {tab === "logs" && (
          <TripLogs
            tripId={trip.id}
            viewerId={viewerId}
            isMember={isMember}
            onOpen={openLog}
            onCopy={copyLog}
            onUnlink={setConfirmUnlink}
          />
        )}
      </Box>

      <TripFab
        tab={tab}
        isMember={isMember}
        isAdmin={isAdmin}
        canJoin={!!user && !isMember}
        joining={joinTrip.isPending}
        hasSelf={self !== null}
        onJoin={() => joinTrip.mutate()}
        onAddDay={() => setDayEditor("new")}
        onAddStay={() => setStayEditor("new")}
        onEditAttendance={() => self && setAttendanceFor({ member: self })}
        onLinkLog={() => setLinking(true)}
        onNewLog={() => newLog()}
        onEdit={() => onEditingChange(true)}
        onDelete={() => setConfirmDelete(true)}
      />

      {dayEditor && (
        <DayDialog
          trip={trip}
          date={dayEditor === "new" ? null : dayEditor}
          actions={{
            self,
            viewerId,
            onEditStay: setStayEditor,
            onEditAttendance: (member, preset) =>
              setAttendanceFor({ member, preset }),
            onOpenLog: openLog,
            onAddStay: (date) => setStayEditor({ arrival: date }),
            onNewLog: () => newLog(),
          }}
          open
          onClose={() => setDayEditor(null)}
        />
      )}
      {stayEditor && (
        <StayDialog
          tripId={trip.id}
          stay={
            stayEditor !== "new" && "id" in stayEditor ? stayEditor : undefined
          }
          presetArrival={
            stayEditor !== "new" && !("id" in stayEditor)
              ? stayEditor.arrival
              : undefined
          }
          open
          onClose={() => setStayEditor(null)}
        />
      )}
      {watchListFor && (
        <StaySectionsDialog
          tripId={trip.id}
          stay={watchListFor}
          open
          onClose={() => setWatchListFor(null)}
        />
      )}
      {attendanceFor && (
        <AttendanceDialog
          tripId={trip.id}
          member={attendanceFor.member}
          preset={attendanceFor.preset}
          open
          onClose={() => setAttendanceFor(null)}
        />
      )}
      {linking && (
        <LinkDescentDialog
          tripId={trip.id}
          open
          onClose={() => setLinking(false)}
        />
      )}

      <ConfirmDialog
        open={confirmDeleteStay !== null}
        title="Delete base?"
        body={`"${confirmDeleteStay?.name}" and its watch list will be removed.`}
        confirmLabel="Delete"
        color="error"
        onConfirm={() => {
          if (confirmDeleteStay) deleteStay.mutate(confirmDeleteStay.id);
          setConfirmDeleteStay(null);
        }}
        onCancel={() => setConfirmDeleteStay(null)}
      />
      <ConfirmDialog
        open={confirmUnlink !== null}
        title="Unlink this log?"
        body="It stays in your logs, just no longer credited to the trip."
        confirmLabel="Unlink"
        onConfirm={() => {
          if (confirmUnlink) {
            linkDescent.mutate({ id: confirmUnlink.id, trip_id: null });
          }
          setConfirmUnlink(null);
        }}
        onCancel={() => setConfirmUnlink(null)}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="Delete trip?"
        body="Members lose the shared plan. Logs stay, they just lose their trip."
        confirmLabel="Delete"
        pendingLabel="Deleting…"
        color="error"
        pending={deleteTrip.isPending}
        onConfirm={async () => {
          await deleteTrip.mutateAsync(trip.id);
          onDeleted();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}

/** Clears the mobile bottom nav; on desktop the pane runs to the window. */
export const fabSx = {
  position: "fixed" as const,
  bottom: {
    xs: "calc(56px + env(safe-area-inset-bottom) + 16px)",
    md: 24,
  },
  right: { xs: 16, md: 24 },
};

/**
 * One screen, one primary action. Each tab has an obvious thing to do, so the
 * FAB does it directly; only where several actions genuinely share the spot
 * does it open a menu.
 */
function TripFab({
  tab,
  isMember,
  isAdmin,
  canJoin,
  joining,
  hasSelf,
  onJoin,
  onAddDay,
  onAddStay,
  onEditAttendance,
  onLinkLog,
  onNewLog,
  onEdit,
  onDelete,
}: {
  tab: TripTab;
  isMember: boolean;
  isAdmin: boolean;
  canJoin: boolean;
  joining: boolean;
  hasSelf: boolean;
  onJoin: () => void;
  onAddDay: () => void;
  onAddStay: () => void;
  onEditAttendance: () => void;
  onLinkLog: () => void;
  onNewLog: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  // Seeing a trip you have not joined, the only thing to do is join it.
  if (canJoin) {
    return (
      <Fab
        variant="extended"
        color="secondary"
        onClick={onJoin}
        disabled={joining}
        aria-label="Join this trip"
        sx={fabSx}
      >
        <AddIcon sx={{ mr: 1 }} />
        Join trip
      </Fab>
    );
  }

  if (tab === "plan" && isMember) {
    return (
      <Fab
        color="secondary"
        onClick={onAddDay}
        aria-label="Add a day"
        sx={fabSx}
      >
        <AddIcon />
      </Fab>
    );
  }

  if (tab === "bases" && isMember) {
    return (
      <Fab
        color="secondary"
        onClick={onAddStay}
        aria-label="Add base"
        sx={fabSx}
      >
        <AddIcon />
      </Fab>
    );
  }

  if (tab === "members" && isMember && hasSelf) {
    return (
      <Fab
        color="secondary"
        onClick={onEditAttendance}
        aria-label="Set your dates"
        sx={fabSx}
      >
        <EditCalendarOutlinedIcon />
      </Fab>
    );
  }

  if (tab === "logs" && isMember) {
    return (
      <SpeedDial
        ariaLabel="Log actions"
        icon={<SpeedDialIcon openIcon={<CloseIcon />} />}
        // The action corner is one colour across the panel's tabs; a dial
        // that defaulted to cyan turned it into a per-tab change.
        FabProps={{ color: "secondary" }}
        sx={fabSx}
      >
        <SpeedDialAction
          icon={<AddIcon />}
          slotProps={{ tooltip: { title: "Log a descent" } }}
          onClick={onNewLog}
        />
        <SpeedDialAction
          icon={<LinkOutlinedIcon />}
          slotProps={{ tooltip: { title: "Link an existing log" } }}
          onClick={onLinkLog}
        />
      </SpeedDial>
    );
  }

  if (!isAdmin) return null;

  return (
    <SpeedDial
      ariaLabel="Trip actions"
      icon={<SpeedDialIcon icon={<MoreVertIcon />} openIcon={<CloseIcon />} />}
      FabProps={{ color: "secondary" }}
      sx={fabSx}
    >
      <SpeedDialAction
        icon={<EditOutlinedIcon />}
        slotProps={{ tooltip: { title: "Edit trip" } }}
        onClick={onEdit}
      />
      <SpeedDialAction
        icon={<DeleteOutlinedIcon />}
        slotProps={{ tooltip: { title: "Delete trip" } }}
        onClick={onDelete}
      />
    </SpeedDial>
  );
}
