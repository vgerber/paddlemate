import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { labelSx, theme } from "@/lib/theme";

const { tokens } = theme;

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  /** Right of the title, before the close button. */
  actions?: ReactNode;
  onClose?: () => void;
}

/** The title row of a floating card: bold title, grey subtitle, the screen's
 * actions and a close button. */
export default function CardHeader({
  title,
  subtitle,
  actions,
  onClose,
}: CardHeaderProps) {
  return (
    <Box
      sx={{
        pl: 2,
        pr: 0.5,
        minHeight: tokens.canvas.headerHeight,
        display: "flex",
        alignItems: "center",
        gap: 1,
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          component="h2"
          noWrap
          sx={{ fontWeight: 600, fontSize: "1rem", lineHeight: 1.3 }}
        >
          {title}
        </Typography>
        {subtitle && (
          <Typography
            noWrap
            sx={{ ...labelSx, color: tokens.onSurfaceVariant }}
          >
            {subtitle}
          </Typography>
        )}
      </Box>
      {actions}
      {onClose && (
        <IconButton
          aria-label="Close"
          onClick={onClose}
          sx={{ width: tokens.touch.min, height: tokens.touch.min }}
        >
          <CloseIcon />
        </IconButton>
      )}
    </Box>
  );
}
