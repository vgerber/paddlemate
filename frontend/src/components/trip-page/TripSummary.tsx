import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { factLabelSx } from "@/components/Fact";
import MemberAvatar from "@/components/trips/MemberAvatar";
import { dateRange } from "@/lib/format";
import { useTripMembers, useTripStays } from "@/lib/hooks/useTrips";

const heading = { ...factLabelSx, px: 2, pt: 1.5, pb: 0.5 } as const;

/** Where the group stays, in order: the plan's opening lines on the desktop
 * card. Nothing when no base is set. */
export function TripStaysSummary({ tripId }: { tripId: number }) {
  const { data: stays } = useTripStays(tripId);
  if (!stays || stays.length === 0) return null;
  return (
    <Box data-testid="trip-stays-summary">
      <Typography sx={heading}>Stays</Typography>
      {stays.map((stay) => (
        <Box key={stay.id} sx={{ px: 2, py: 0.75 }}>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {stay.name}
          </Typography>
          {stay.arrival && (
            <Typography variant="caption" color="textSecondary">
              {dateRange(stay.arrival, stay.departure)}
            </Typography>
          )}
        </Box>
      ))}
    </Box>
  );
}

/** Who is coming, as initials; the card of its own takes over from 1600. */
export function TripMembersSummary({ tripId }: { tripId: number }) {
  const { data: members } = useTripMembers(tripId);
  if (!members || members.length === 0) return null;
  return (
    <Box data-testid="trip-members-summary">
      <Typography sx={heading}>Members</Typography>
      <Box sx={{ display: "flex", gap: 1, px: 2, py: 1, flexWrap: "wrap" }}>
        {members.map((m) => (
          <MemberAvatar key={m.user_id} name={m.username} size={32} />
        ))}
      </Box>
    </Box>
  );
}
