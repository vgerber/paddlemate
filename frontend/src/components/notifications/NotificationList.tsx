import DirectionsBoatOutlinedIcon from "@mui/icons-material/DirectionsBoatOutlined";
import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";
import HotelOutlinedIcon from "@mui/icons-material/HotelOutlined";
import LuggageOutlinedIcon from "@mui/icons-material/LuggageOutlined";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import Box from "@mui/material/Box";
import ListItemButton from "@mui/material/ListItemButton";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { phoneCardSx } from "@/components/canvas/flatRow";
import EmptyState from "@/components/states/EmptyState";
import ErrorState from "@/components/states/ErrorState";
import LoadingBox from "@/components/states/LoadingBox";
import type { TripEvent } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import {
  useMarkNotificationsRead,
  useNotifications,
  useRefreshNotifications,
} from "@/lib/hooks/useNotifications";
import { alphas, fonts, theme } from "@/lib/theme";

const { phone } = theme.tokens;

/** The icon the app uses for the thing that changed. */
function KindIcon({ kind }: { kind: TripEvent["kind"] }) {
  if (kind.startsWith("member_")) return <GroupOutlinedIcon />;
  if (kind.startsWith("stay_") || kind.startsWith("candidate_")) {
    return <HotelOutlinedIcon />;
  }
  if (kind === "log_linked") return <DirectionsBoatOutlinedIcon />;
  return <LuggageOutlinedIcon />;
}

/** What changed on the caller's trips, newest first. Opening it marks
 * everything shown read; the entries that were new keep their dot until the
 * list is opened again. */
export default function NotificationList({
  onOpenTrip,
  cards,
}: {
  /** Rows as cards on the ground, like the other phone lists; the popover
   * keeps them flat on its own surface. */
  cards?: boolean;
  /** Called after navigating to a trip, e.g. to close a popover. */
  onOpenTrip?: () => void;
}) {
  const query = useNotifications(true);
  const { data, isLoading } = query;
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
  if (query.isError && !data) {
    return (
      <ErrorState
        error={query.error}
        fallback="Could not load your notifications."
        onRetry={() => query.refetch()}
        py={5}
      />
    );
  }
  if (!data?.items.length) {
    return (
      <EmptyState
        icon={<NotificationsNoneOutlinedIcon />}
        title="Nothing new"
        caption="Changes others make to your trips show up here."
        pt={7.5}
        pb={4}
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
    <Box
      sx={cards ? { ...phoneCardSx, my: 1.5, overflow: "hidden" } : undefined}
    >
      {data.items.map((e) => (
        <NotificationRow
          key={e.id}
          event={e}
          card={cards}
          onClick={() => open(e)}
        />
      ))}
    </Box>
  );
}

function NotificationRow({
  event,
  card,
  onClick,
}: {
  event: TripEvent;
  card?: boolean;
  onClick: () => void;
}) {
  return (
    <ListItemButton
      onClick={onClick}
      sx={{
        alignItems: "flex-start",
        gap: card ? `${phone.iconGap}px` : 1.25,
        py: 1.25,
        px: card ? `${phone.inner}px` : undefined,
        "&:not(:last-of-type)": {
          borderBottom: "1px solid",
          borderColor: `${theme.tokens.outlineVariant}${alphas.hairline}`,
        },
      }}
    >
      {card ? (
        <Box
          sx={{
            position: "relative",
            width: phone.icon,
            height: 20,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: event.unread ? theme.tokens.primary : "text.secondary",
            "& .MuiSvgIcon-root": { fontSize: 22 },
          }}
        >
          <KindIcon kind={event.kind} />
          {event.unread && (
            <Box
              sx={{
                position: "absolute",
                top: -3,
                right: -2,
                width: 8,
                height: 8,
                borderRadius: "50%",
                bgcolor: theme.tokens.primary,
                border: `2px solid ${theme.tokens.surface}`,
                boxSizing: "content-box",
              }}
            />
          )}
        </Box>
      ) : (
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
      )}
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography
          sx={{
            fontSize: "0.875rem",
            lineHeight: "20px",
            fontWeight: event.unread ? 600 : 500,
          }}
        >
          {event.text}
        </Typography>
        <Typography
          color="textSecondary"
          noWrap
          sx={{
            display: "block",
            fontFamily: fonts.body,
            fontSize: "0.8125rem",
            lineHeight: "18px",
          }}
        >
          {event.trip_name} · {timeAgo(event.created_at)}
        </Typography>
      </Box>
    </ListItemButton>
  );
}
