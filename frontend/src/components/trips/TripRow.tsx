import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import { desktopFlatRow } from "@/components/canvas/flatRow";
import { openRowSx } from "@/components/openRow";
import { tripStanding } from "@/components/trip-page/planWeek";
import type { Trip } from "@/lib/api";
import { dateRange, todayIso } from "@/lib/format";
import { useTripMembers } from "@/lib/hooks/useTrips";
import { fonts, labelSx, theme } from "@/lib/theme";
import MemberAvatar from "./MemberAvatar";
import RolePill from "./RolePill";

const { tokens } = theme;

const MAX_AVATARS = 4;

/** One trip as a card: what it is called, when it runs and where it stands,
 * its mood in the group's own words, and who is coming. */
export default function TripRow({
  trip,
  selected = false,
  onSelect,
}: {
  trip: Trip;
  /** Marks the card the desktop detail pane is showing. */
  selected?: boolean;
  onSelect: () => void;
}) {
  const { data: members } = useTripMembers(trip.id);
  const standing = tripStanding(trip.start_date, trip.end_date, todayIso());
  const shown = (members ?? []).slice(0, MAX_AVATARS);

  return (
    <ButtonBase
      data-testid="trip-card"
      aria-current={selected || undefined}
      onClick={onSelect}
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 0.75,
        width: "100%",
        textAlign: "left",
        p: 1.75,
        borderRadius: `${tokens.radii.md}px`,
        bgcolor: tokens.surface,
        boxShadow: tokens.elevation.e1,
        ...openRowSx(selected),
        ...desktopFlatRow,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
        <Typography
          sx={{
            fontFamily: fonts.body,
            fontWeight: 600,
            fontSize: "1rem",
            flex: 1,
            minWidth: 0,
          }}
          noWrap
        >
          {trip.name}
        </Typography>
        {trip.viewer_role === "admin" && <RolePill>Admin</RolePill>}
      </Box>

      <Typography
        sx={{
          ...labelSx,
          fontSize: "0.8125rem",
          fontWeight: 400,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {dateRange(trip.start_date, trip.end_date)}
        {" · "}
        <Box
          component="span"
          sx={{ color: standing === "under way" ? tokens.primary : undefined }}
        >
          {standing === "under way"
            ? "Under way"
            : standing === "past"
              ? "Past"
              : "Upcoming"}
        </Box>
      </Typography>

      {trip.description && (
        <Typography
          variant="body2"
          sx={{
            fontSize: "0.875rem",
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {trip.description}
        </Typography>
      )}

      <Box sx={{ display: "flex", alignItems: "center", mt: 0.5 }}>
        {shown.map((m, i) => (
          <Box key={m.user_id} sx={{ ml: i === 0 ? 0 : -0.75 }}>
            <MemberAvatar name={m.username} size={28} ring />
          </Box>
        ))}
        {trip.member_count > shown.length && (
          <Typography sx={{ ...labelSx, ml: 1 }}>
            +{trip.member_count - shown.length}
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        {trip.descent_count > 0 && (
          <Typography
            sx={{ ...labelSx, color: `${tokens.onSurfaceVariant}` }}
            title="Logs"
          >
            {trip.descent_count} {trip.descent_count === 1 ? "log" : "logs"}
          </Typography>
        )}
      </Box>
    </ButtonBase>
  );
}
