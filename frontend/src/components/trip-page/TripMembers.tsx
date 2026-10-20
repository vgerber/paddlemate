import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import EditCalendarOutlinedIcon from "@mui/icons-material/EditCalendarOutlined";
import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";
import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { factLabelSx } from "@/components/Fact";
import RowMenu, { type RowAction } from "@/components/RowMenu";
import QueryStates from "@/components/states/QueryStates";
import MemberAvatar from "@/components/trips/MemberAvatar";
import RolePill from "@/components/trips/RolePill";
import type { TripMember, TripMemberRole } from "@/lib/api";
import { clockTime, dateRange } from "@/lib/format";
import {
  usePatchTripMember,
  useRemoveTripMember,
  useTripMembers,
} from "@/lib/hooks/useTrips";
import { fonts, theme } from "@/lib/theme";

const { tokens } = theme;

interface Props {
  tripId: number;
  viewerId: string | null;
  isAdmin: boolean;
  onEditAttendance: (member: TripMember) => void;
}

/**
 * Who is coming, and when each of them can make it. Attendance settles early
 * while the itinerary keeps moving, so it lives here rather than on a stay.
 */
export default function TripMembers({
  tripId,
  viewerId,
  isAdmin,
  onEditAttendance,
}: Props) {
  const membersQuery = useTripMembers(tripId);
  const members = membersQuery.data;
  const patchMember = usePatchTripMember(tripId);
  const removeMember = useRemoveTripMember(tripId);
  const navigate = useNavigate();
  const [confirmRemove, setConfirmRemove] = useState<TripMember | null>(null);

  const leaving = confirmRemove?.user_id === viewerId;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <QueryStates
        query={membersQuery}
        count={members?.length ?? 0}
        errorFallback="Could not load the members."
        loadingSize={40}
        py={6}
        empty={{ icon: <GroupOutlinedIcon />, title: "No members yet." }}
      >
        {(members ?? []).map((m) => (
          <MemberRow
            key={m.user_id}
            member={m}
            isSelf={m.user_id === viewerId}
            isAdmin={isAdmin}
            onRoleChange={(role) =>
              patchMember.mutate({ userId: m.user_id, body: { role } })
            }
            onEditAttendance={() => onEditAttendance(m)}
            onRemove={() => setConfirmRemove(m)}
          />
        ))}
      </QueryStates>

      <ConfirmDialog
        open={confirmRemove !== null}
        title={leaving ? "Leave trip?" : "Remove member?"}
        body={
          // Matches what the schema does: a log hangs off its owner's
          // membership, so it leaves the trip with them.
          leaving
            ? "Your logs stay in your logbook but are no longer part of this trip."
            : `${confirmRemove?.username} loses access to the trip, and their logs leave it with them.`
        }
        confirmLabel={leaving ? "Leave" : "Remove"}
        pendingLabel={leaving ? "Leaving…" : "Removing…"}
        pending={removeMember.isPending}
        color="error"
        onConfirm={() => {
          if (!confirmRemove) return;
          // Stays open until the server agrees: a refused leave (the last
          // admin) must not look like it went through.
          removeMember.mutate(confirmRemove.user_id, {
            onSuccess: () => {
              setConfirmRemove(null);
              // A trip you left is one you can no longer open.
              if (leaving) navigate({ to: "/trips" });
            },
          });
        }}
        onCancel={() => setConfirmRemove(null)}
      />
    </Box>
  );
}

/** "· 19:30 - 11:00" once the hours are known, and only the half that is. */
function attendanceHours(member: TripMember): string {
  const from = member.arrival_time ? clockTime(member.arrival_time) : null;
  const to = member.departure_time ? clockTime(member.departure_time) : null;
  if (!from && !to) return "";
  return ` · ${from ?? "?"} - ${to ?? "?"}`;
}

function MemberRow({
  member,
  isSelf,
  isAdmin,
  onRoleChange,
  onEditAttendance,
  onRemove,
}: {
  member: TripMember;
  isSelf: boolean;
  isAdmin: boolean;
  onRoleChange: (role: TripMemberRole) => void;
  onEditAttendance: () => void;
  onRemove: () => void;
}) {
  // One control per row, and every action named. Role is a value here, not a
  // button: changing it is one of the named actions.
  const actions: RowAction[] = [];
  if (isSelf) {
    actions.push({
      label: "Set your dates",
      icon: <EditCalendarOutlinedIcon fontSize="small" />,
      onClick: onEditAttendance,
    });
  }
  if (isAdmin) {
    actions.push({
      label: member.role === "admin" ? "Make member" : "Make admin",
      icon: <ShieldOutlinedIcon fontSize="small" />,
      onClick: () => onRoleChange(member.role === "admin" ? "member" : "admin"),
    });
  }
  if (isAdmin || isSelf) {
    actions.push({
      label: isSelf ? "Leave trip" : "Remove from trip",
      icon: isSelf ? (
        <LogoutOutlinedIcon fontSize="small" />
      ) : (
        <DeleteOutlinedIcon fontSize="small" />
      ),
      onClick: onRemove,
      danger: true,
    });
  }

  const attendance = member.arrival
    ? `${dateRange(member.arrival, member.departure)}${attendanceHours(member)}`
    : member.departure
      ? `until ${member.departure}`
      : null;

  return (
    <Box
      data-testid="member-row"
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.25,
        minHeight: 56,
        pl: 1.5,
        pr: 0.5,
        borderRadius: `${tokens.radii.md}px`,
        bgcolor: tokens.surface,
        boxShadow: tokens.elevation.e1,
      }}
    >
      {/* Your own row goes where its menu's first action goes; somebody
          else's dates are not yours to open. */}
      <ButtonBase
        onClick={isSelf ? onEditAttendance : undefined}
        disabled={!isSelf}
        sx={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: 1.25,
          py: 1,
          textAlign: "left",
          "&.Mui-disabled": { opacity: 1 },
        }}
      >
        <MemberAvatar name={member.username} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontFamily: fonts.body,
              fontWeight: 600,
              fontSize: "0.9375rem",
            }}
            noWrap
          >
            {member.username}
            {isSelf && (
              <Typography
                component="span"
                sx={{ ...factLabelSx, ml: 1, display: "inline" }}
              >
                You
              </Typography>
            )}
          </Typography>
          <Typography
            sx={{
              ...factLabelSx,
              fontSize: "0.8125rem",
              fontWeight: 400,
              fontVariantNumeric: "tabular-nums",
              color: attendance ? "text.secondary" : "text.disabled",
            }}
            noWrap
          >
            {attendance ?? (isSelf ? "No dates set" : "Not said yet")}
          </Typography>
        </Box>
      </ButtonBase>

      <RolePill testId="member-role">
        {member.role === "admin" ? "Admin" : "Member"}
      </RolePill>
      <RowMenu actions={actions} label={`Actions for ${member.username}`} />
    </Box>
  );
}
