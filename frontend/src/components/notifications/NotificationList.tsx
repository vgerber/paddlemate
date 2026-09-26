import Box from "@mui/material/Box";
import ListItemButton from "@mui/material/ListItemButton";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import EmptyState from "@/components/states/EmptyState";
import LoadingBox from "@/components/states/LoadingBox";
import type { TripEvent } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import {
  useMarkNotificationsRead,
  useNotifications,
  useRefreshNotifications,
} from "@/lib/hooks/useNotifications";
import { fonts, theme } from "@/lib/theme";

/** What changed on the caller's trips, newest first. Opening it marks
 * everything shown read; the entries that were new keep their dot until the
 * list is opened again. */
export default function NotificationList({
  onOpenTrip,
}: {
  /** Called after navigating to a trip, e.g. to close a popover. */
  onOpenTrip?: () => void;
}) {
  const { data, isLoading } = useNotifications(true);
  const refresh = useRefreshNotifications();
  // The count beside the bell may predate this list - changes read on
  // another device, a trip left, old ones pruned. Opening shows both fresh.
  useEffect(() => {
    refresh();
  }, [refresh]);
  const markRead = useMarkNotificationsRead();
  const navigate = useNavigate();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));

  // Up to the newest entry shown, not to now: a change landing between the
  // fetch and this call stays unread.
  const newest = data?.items[0];
  const hasUnread = data?.items.some((e) => e.unread) ?? false;
  const { mutate } = markRead;
  useEffect(() => {
    if (newest && hasUnread) mutate(newest.created_at);
  }, [newest, hasUnread, mutate]);

  if (isLoading) return <LoadingBox size={28} pt={3} />;
  if (!data?.items.length) {
    return (
      <EmptyState
        title="Nothing new"
        caption="Changes others make to your trips show up here."
        py={4}
      />
    );
  }

  const open = (e: TripEvent) => {
    if (isDesktop) {
      navigate({ to: "/trips", search: { selected: e.trip_id } });
    } else {
      navigate({
        to: "/trips/$tripId",
        params: { tripId: String(e.trip_id) },
        search: { edit: false },
      });
    }
    onOpenTrip?.();
  };

  return (
    <Box>
      {data.items.map((e) => (
        <NotificationRow key={e.id} event={e} onClick={() => open(e)} />
      ))}
    </Box>
  );
}

function NotificationRow({
  event,
  onClick,
}: {
  event: TripEvent;
  onClick: () => void;
}) {
  return (
    <ListItemButton
      onClick={onClick}
      sx={{
        alignItems: "flex-start",
        gap: 1.25,
        borderBottom: "1px solid",
        borderColor: `${theme.tokens.outlineVariant}55`,
        py: 1.25,
      }}
    >
      <Box
        sx={{
          width: 8,
          height: 8,
          mt: 0.75,
          flexShrink: 0,
          borderRadius: "50%",
          bgcolor: event.unread ? theme.tokens.primary : "transparent",
        }}
      />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography
          sx={{
            fontSize: "0.8125rem",
            fontWeight: event.unread ? 600 : 400,
          }}
        >
          {event.text}
        </Typography>
        <Typography
          variant="caption"
          color="text.disabled"
          noWrap
          sx={{ display: "block", fontFamily: fonts.label }}
        >
          {event.trip_name} · {timeAgo(event.created_at)}
        </Typography>
      </Box>
    </ListItemButton>
  );
}
