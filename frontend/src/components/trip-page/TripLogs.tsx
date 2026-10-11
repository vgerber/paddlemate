import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import DirectionsBoatOutlinedIcon from "@mui/icons-material/DirectionsBoatOutlined";
import LinkOffOutlinedIcon from "@mui/icons-material/LinkOffOutlined";
import Box from "@mui/material/Box";
import DescentCard from "@/components/descents/DescentCard";
import ListPaneHeader from "@/components/ListPaneHeader";
import RowMenu from "@/components/RowMenu";
import EmptyState from "@/components/states/EmptyState";
import LoadingBox from "@/components/states/LoadingBox";
import type { Descent } from "@/lib/api";
import { useTripDescents } from "@/lib/hooks/useDescents";
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
  const { data, isLoading } = useTripDescents(tripId);

  if (isLoading) return <LoadingBox size={40} pt={6} />;

  const descents = data ?? [];

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
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <ListPaneHeader count={descents.length} sx={{ px: 0.5 }} />
      {descents.map((d) => (
        // The same card as My logs: the card is the log, its menu sits inside.
        <Box
          key={d.id}
          sx={{
            display: "flex",
            alignItems: "flex-start",
            borderRadius: `${theme.tokens.radii.md}px`,
            bgcolor: theme.tokens.surface,
            boxShadow: theme.tokens.elevation.e1,
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0, pl: 1.75 }}>
            <DescentCard
              descent={d}
              showAuthor
              flush
              onClick={() => onOpen(d)}
            />
          </Box>
          {isMember && (
            <Box sx={{ pt: 1, pr: 0.5 }}>
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
