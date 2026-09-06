import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import EditCalendarOutlinedIcon from "@mui/icons-material/EditCalendarOutlined";
import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import ListItemButton from "@mui/material/ListItemButton";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { factLabelSx } from "@/components/Fact";
import RowMenu, { type RowAction } from "@/components/RowMenu";
import LoadingBox from "@/components/states/LoadingBox";
import type { TripMember, TripMemberRole } from "@/lib/api";
import { clockTime, dateRange } from "@/lib/format";
import {
  usePatchTripMember,
  useRemoveTripMember,
  useTripMembers,
} from "@/lib/hooks/useTrips";
import { fonts, theme } from "@/lib/theme";

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
  const { data: members, isLoading } = useTripMembers(tripId);
  const patchMember = usePatchTripMember(tripId);
  const removeMember = useRemoveTripMember(tripId);
  const [confirmRemove, setConfirmRemove] = useState<TripMember | null>(null);

  if (isLoading) return <LoadingBox size={40} pt={6} />;

  const leaving = confirmRemove?.user_id === viewerId;

  return (
    <Box>
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

      <ConfirmDialog
        open={confirmRemove !== null}
        title={leaving ? "Leave trip?" : "Remove member?"}
        body={
          leaving
            ? "Your logs stay linked to the trip."
            : `${confirmRemove?.username} loses access to the trip.`
        }
        confirmLabel={leaving ? "Leave" : "Remove"}
        color="error"
        onConfirm={() => {
          if (confirmRemove) removeMember.mutate(confirmRemove.user_id);
          setConfirmRemove(null);
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
      sx={{
        borderBottom: "1px solid",
        borderColor: `${theme.tokens.outlineVariant}55`,
      }}
    >
      {/* Your own row goes where its menu's first action goes; somebody
          else's dates are not yours to open. The menu lives inside the row
          so hovering covers it too - and stays clickable, which it would not
          be inside a disabled button. */}
      <ListItemButton
        onClick={isSelf ? onEditAttendance : undefined}
        disableRipple={!isSelf}
        tabIndex={isSelf ? 0 : -1}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          py: 1.25,
          cursor: isSelf ? "pointer" : "default",
          ...(isSelf ? {} : { "&:hover": { bgcolor: "transparent" } }),
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontFamily: fonts.label,
              fontWeight: 600,
              fontSize: "0.8125rem",
            }}
            noWrap
          >
            {member.username}
            {isSelf && (
              <Typography
                component="span"
                sx={{ ...factLabelSx, ml: 1, display: "inline" }}
              >
                you
              </Typography>
            )}
          </Typography>
          {attendance ? (
            <Typography
              sx={{
                fontFamily: fonts.label,
                fontSize: "0.75rem",
                color: "primary.main",
              }}
            >
              {attendance}
            </Typography>
          ) : (
            <Typography sx={factLabelSx}>
              {isSelf ? "no dates set" : "not said yet"}
            </Typography>
          )}
        </Box>

        <Chip label={member.role} size="small" variant="outlined" />
        <RowMenu actions={actions} label={`Actions for ${member.username}`} />
      </ListItemButton>
    </Box>
  );
}
