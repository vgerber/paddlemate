import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Popover from "@mui/material/Popover";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { useNotificationState } from "@/lib/hooks/useNotifications";
import { labelSx, theme } from "@/lib/theme";
import NotificationList from "./NotificationList";

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
        sx={{ color: "text.secondary" }}
      >
        <UnreadBadge count={unread}>
          <NotificationsNoneOutlinedIcon fontSize="small" />
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
              maxHeight: "min(560px, calc(100vh - 64px))",
              display: "flex",
              flexDirection: "column",
            },
          },
        }}
      >
        <Box
          sx={{
            px: 2,
            py: 1.25,
            borderBottom: "1px solid",
            borderColor: "divider",
            bgcolor: theme.tokens.surfaceLow,
          }}
        >
          <Typography sx={{ ...labelSx, fontSize: "0.6875rem" }}>
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
