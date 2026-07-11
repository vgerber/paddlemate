import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";

/** The round primary-action button used in panel bottom bars. */
export function RoundActionButton({
  onClick,
  disabled,
  ariaLabel,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <IconButton
      size="large"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      sx={{
        borderRadius: "50%",
        bgcolor: "secondary.main",
        color: "secondary.contrastText",
        "&:hover": { bgcolor: "secondary.light" },
        "&.Mui-disabled": {
          bgcolor: "action.disabledBackground",
          color: "action.disabled",
        },
      }}
    >
      {children}
    </IconButton>
  );
}

/** Bottom action bar shared by the suggest panels and the section wizard:
 * a left icon (back/cancel), title + subtitle, and the primary action. */
export default function PanelBottomBar({
  leftIcon,
  onLeftClick,
  leftLabel,
  leftDisabled,
  title,
  subtitle,
  action,
}: {
  leftIcon: ReactNode;
  onLeftClick: () => void;
  leftLabel: string;
  leftDisabled?: boolean;
  title: string;
  subtitle: string;
  action: ReactNode;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        px: 1,
        pt: 1,
        pb: "calc(8px + env(safe-area-inset-bottom))",
        borderTop: "1px solid",
        borderColor: "divider",
        flexShrink: 0,
        gap: 1,
      }}
    >
      <IconButton
        onClick={onLeftClick}
        aria-label={leftLabel}
        disabled={leftDisabled}
      >
        {leftIcon}
      </IconButton>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle2" noWrap sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block" }}
        >
          {subtitle}
        </Typography>
      </Box>
      {action}
    </Box>
  );
}
