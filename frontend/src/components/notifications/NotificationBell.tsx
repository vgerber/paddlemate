import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Popover from "@mui/material/Popover";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { useNotificationState } from "@/lib/hooks/useNotifications";
import { NotificationsIcon } from "@/lib/icons";
import { theme } from "@/lib/theme";
import NotificationList from "./NotificationList";

const { tokens } = theme;

/** The desktop top bar's bell: the unread count, and the list beneath it. */
export default function NotificationBell() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const { data: state } = useNotificationState(true);
  const unread = state?.unread_count ?? 0;

  return (
    <>
      <IconButton
        size="small"
        aria-label={unread ? `${unread} unread notifications` : "Notifications"}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{
          width: tokens.touch.min,
          height: tokens.touch.min,
          color: "text.secondary",
        }}
      >
        <UnreadBadge count={unread}>
          <NotificationsIcon fontSize="small" />
        </UnreadBadge>
      </IconButton>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            sx: {
              width: 380,
              mt: 1.5,
              borderRadius: `${tokens.radii.lg}px`,
              boxShadow: tokens.elevation.e2,
              maxHeight: "min(560px, calc(100vh - 64px))",
              display: "flex",
              flexDirection: "column",
            },
          },
        }}
      >
        <Box sx={{ px: 2, pt: 1.75, pb: 1.25 }}>
          <Typography sx={{ fontWeight: 700, fontSize: "0.9375rem" }}>
            Trip changes
          </Typography>
        </Box>
        <Box sx={{ overflowY: "auto", minHeight: 0 }}>
          {/* Mounted only while open, so opening is what marks read. */}
          {anchor && <NotificationList onOpenTrip={() => setAnchor(null)} />}
        </Box>
      </Popover>
    </>
  );
}

/** The unread count over an icon; hidden at zero. */
export function UnreadBadge({
  count,
  children,
}: {
  count: number;
  children: React.ReactNode;
}) {
  // MUI keeps a zero badge in the DOM, where a screen reader would read it.
  if (count <= 0) return <>{children}</>;
  return (
    <Badge
      badgeContent={count}
      max={99}
      color="primary"
      sx={{
        "& .MuiBadge-badge": {
          fontSize: "0.625rem",
          height: 16,
          minWidth: 16,
          px: 0.5,
        },
      }}
    >
      {children}
    </Badge>
  );
}
