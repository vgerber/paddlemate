import Box from "@mui/material/Box";
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
  useLinkDescentToTrip,
  useTripMembers,
} from "@/lib/hooks/useTrips";
import AddMemberDialog from "./AddMemberDialog";
import AttendanceDialog from "./AttendanceDialog";
import type { DayActions } from "./DayDetail";
import DayPickerDialog from "./DayPickerDialog";
import LinkDescentDialog from "./LinkDescentDialog";
import StayDialog from "./StayDialog";
import StaySectionsDialog from "./StaySectionsDialog";
import TripFab from "./TripFab";
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
  /** Rendered beside the trips list, which already names the trip and holds
   * the way back - so the panel drops its own title and back arrow. */
  embedded?: boolean;
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
  embedded = false,
}: Props) {
  const navigate = useNavigate();
  const { user } = useSession();
  const { data: members } = useTripMembers(trip.id);
  const deleteTrip = useDeleteTrip();
  const deleteStay = useDeleteTripStay(trip.id);
  const linkDescent = useLinkDescentToTrip(trip.id);

  const [tab, setTab] = useState<TripTab>("plan");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [proposing, setProposing] = useState(false);
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
  // The day expanded in the plan, and the calendar that picks a new one.
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [pickingDay, setPickingDay] = useState(false);

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

  const dayActions: DayActions = {
    self,
    viewerId,
    canEdit: isMember,
    onEditStay: setStayEditor,
    onEditAttendance: (member, preset) => setAttendanceFor({ member, preset }),
    onOpenLog: openLog,
    onAddStay: (date) => setStayEditor({ arrival: date }),
    onNewLog: () => newLog(),
  };

  const stayActions = {
    onEditStay: setStayEditor,
    onEditWatchList: setWatchListFor,
    onDeleteStay: setConfirmDeleteStay,
  };

  return (
    <>
      <PanelHeader
        title={embedded ? undefined : trip.name}
        subtitle={
          embedded ? undefined : dateRange(trip.start_date, trip.end_date)
        }
        onBack={embedded ? undefined : onClose}
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
            openDay={openDay}
            onToggleDay={(date) =>
              setOpenDay((current) => (current === date ? null : date))
            }
            actions={dayActions}
          />
        )}
        {tab === "bases" && (
          <TripStays
            tripId={trip.id}
            isMember={isMember}
            isAdmin={isAdmin}
            viewerId={viewerId}
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
        hasSelf={self !== null}
        onAddMember={() => setAddingMember(true)}
        onAddDay={() => setPickingDay(true)}
        onAddStay={() => setStayEditor("new")}
        onProposeStay={() => setProposing(true)}
        onEditAttendance={() => self && setAttendanceFor({ member: self })}
        onLinkLog={() => setLinking(true)}
        onNewLog={() => newLog()}
        onEdit={() => onEditingChange(true)}
        onDelete={() => setConfirmDelete(true)}
      />

      {pickingDay && (
        <DayPickerDialog
          trip={trip}
          open
          onSelect={(date) => {
            setPickingDay(false);
            setOpenDay(date);
          }}
          onClose={() => setPickingDay(false)}
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
      {proposing && (
        <StayDialog
          tripId={trip.id}
          propose
          open
          onClose={() => setProposing(false)}
        />
      )}
      {addingMember && (
        <AddMemberDialog
          tripId={trip.id}
          memberIds={(members ?? []).map((m) => m.user_id)}
          open
          onClose={() => setAddingMember(false)}
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
