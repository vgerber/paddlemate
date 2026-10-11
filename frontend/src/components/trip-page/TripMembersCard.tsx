import Box from "@mui/material/Box";
import { useState } from "react";
import DockedAction from "@/components/DockedAction";
import type { Trip, TripMember } from "@/lib/api";
import { useSession } from "@/lib/hooks/useSession";
import { useTripMembers } from "@/lib/hooks/useTrips";
import AddMemberDialog from "./AddMemberDialog";
import AttendanceDialog from "./AttendanceDialog";
import TripMembers from "./TripMembers";

/** Who is coming, as a card of its own on a very wide screen: the same list
 * the Members tab shows, with the tab's action at the foot. It owns the
 * dialogs that action opens. */
export default function TripMembersCard({ trip }: { trip: Trip }) {
  const { user } = useSession();
  const { data: members } = useTripMembers(trip.id);
  const [adding, setAdding] = useState(false);
  const [attendanceFor, setAttendanceFor] = useState<TripMember | null>(null);

  const viewerId = user?.id ?? null;
  const isAdmin = trip.viewer_role === "admin";
  const self = members?.find((m) => m.user_id === viewerId) ?? null;

  return (
    <Box
      data-testid="trip-members-card"
      sx={{ height: "100%", display: "flex", flexDirection: "column" }}
    >
      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", p: 1.5 }}>
        <TripMembers
          tripId={trip.id}
          viewerId={viewerId}
          isAdmin={isAdmin}
          onEditAttendance={setAttendanceFor}
        />
      </Box>
      {isAdmin && (
        <DockedAction label="Add member" onClick={() => setAdding(true)} />
      )}
      {!isAdmin && trip.viewer_role != null && self && (
        <DockedAction
          label="Set your dates"
          onClick={() => setAttendanceFor(self)}
        />
      )}
      {adding && (
        <AddMemberDialog
          tripId={trip.id}
          memberIds={(members ?? []).map((m) => m.user_id)}
          open
          onClose={() => setAdding(false)}
        />
      )}
      {attendanceFor && (
        <AttendanceDialog
          tripId={trip.id}
          member={attendanceFor}
          open
          onClose={() => setAttendanceFor(null)}
        />
      )}
    </Box>
  );
}
