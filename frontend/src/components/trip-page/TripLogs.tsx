import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import DirectionsBoatOutlinedIcon from "@mui/icons-material/DirectionsBoatOutlined";
import LinkOffOutlinedIcon from "@mui/icons-material/LinkOffOutlined";
import Box from "@mui/material/Box";
import DescentCard from "@/components/descents/DescentCard";
import RowMenu from "@/components/RowMenu";
import EmptyState from "@/components/states/EmptyState";
import LoadingBox from "@/components/states/LoadingBox";
import type { Descent } from "@/lib/api";
import { useDescents } from "@/lib/hooks/useDescents";
import { theme } from "@/lib/theme";

interface Props {
  tripId: number;
  viewerId: string | null;
  isMember: boolean;
  onOpen: (descent: Descent) => void;
  onCopy: (descent: Descent) => void;
  onUnlink: (descent: Descent) => void;
}

/**
 * Every log in the trip. Inside a trip the group has already agreed to share,
 * so a member sees co-members' logs whatever their visibility - that setting
 * governs the public listing, not this one.
 */
export default function TripLogs({
  tripId,
  viewerId,
  isMember,
  onOpen,
  onCopy,
  onUnlink,
}: Props) {
  const { data, isLoading } = useDescents({ trip_id: tripId });

  if (isLoading) return <LoadingBox size={40} pt={6} />;

  const descents = data?.items ?? [];

  if (descents.length === 0) {
    return (
      <EmptyState
        icon={
          <DirectionsBoatOutlinedIcon
            sx={{ fontSize: 48, color: "text.disabled" }}
          />
        }
        title="No logs in this trip yet."
        py={6}
      />
    );
  }

  return (
    <Box>
      {descents.map((d) => (
        <Box
          key={d.id}
          onClick={() => onOpen(d)}
          sx={{
            display: "flex",
            alignItems: "flex-start",
            cursor: "pointer",
            borderBottom: "1px solid",
            borderColor: `${theme.tokens.outlineVariant}55`,
            // The row, not the card, carries the hover - otherwise the band
            // stops short of the menu beside it.
            "&:hover": { bgcolor: "action.hover" },
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0, pl: 2, pr: 1 }}>
            <DescentCard descent={d} showAuthor flush />
          </Box>
          {isMember && (
            <Box sx={{ pt: 1.5, pr: 0.5 }}>
              <RowMenu
                label="Log actions"
                actions={
                  d.user_id === viewerId
                    ? [
                        {
                          label: "Unlink from trip",
                          icon: <LinkOffOutlinedIcon fontSize="small" />,
                          onClick: () => onUnlink(d),
                        },
                      ]
                    : [
                        {
                          label: "Copy to my log",
                          icon: <ContentCopyOutlinedIcon fontSize="small" />,
                          onClick: () => onCopy(d),
                        },
                      ]
                }
              />
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}
