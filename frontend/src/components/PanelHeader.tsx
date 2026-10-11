import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import type { HTMLAttributes, ReactNode } from "react";
import { theme } from "@/lib/theme";
import UnderlineTabs from "./UnderlineTabs";

const { tokens } = theme;

const backIconSx = { fontSize: 22, color: "text.primary" } as const;

interface PanelHeaderProps<T extends string> {
  /** Omitted where the panel is already named beside it - a desktop detail
   * pane next to the list it was picked from. The tab bar then stands alone. */
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  backIcon?: "arrow" | "close";
  actionButton?: ReactNode;
  tabs?: {
    value: T;
    onChange: (t: T) => void;
    options: { value: T; label: string }[];
    /** Swipe state from `useSwipeTabs`, so the underline follows a drag. */
    progress?: number;
    dragging?: boolean;
    /** `gestureProps` from `useSwipeTabs`, so a swipe can start on the bar. */
    gesture?: HTMLAttributes<HTMLElement>;
  };
}

/** The app's one panel header: back arrow, bold title, grey subtitle, action
 * icons right, and underlined tabs when the panel has views.
 * Without a title it is the tab bar alone, in the same chrome. */
export default function PanelHeader<T extends string>({
  title,
  subtitle,
  onBack,
  backIcon = "arrow",
  actionButton,
  tabs,
}: PanelHeaderProps<T>) {
  return (
    <Box
      sx={{
        px: 2,
        pt: title ? 1.5 : 0,
        pb: tabs ? 0 : 1,
        bgcolor: tokens.surface,
        boxShadow: tokens.elevation.e1,
        position: "relative",
        zIndex: 1,
        flexShrink: 0,
      }}
    >
      {title && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            mb: tabs ? 0.75 : 0,
          }}
        >
          {onBack && (
            <IconButton
              onClick={onBack}
              sx={{
                width: tokens.touch.min,
                height: tokens.touch.min,
                ml: -0.75,
              }}
              aria-label={backIcon === "close" ? "Close" : "Back"}
            >
              {backIcon === "close" ? (
                <CloseIcon sx={backIconSx} />
              ) : (
                <ArrowBackIcon sx={backIconSx} />
              )}
            </IconButton>
          )}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h3" noWrap>
              {title}
            </Typography>
            {subtitle && (
              <Typography
                variant="body2"
                color="textSecondary"
                sx={{ fontSize: "0.8125rem", lineHeight: "18px" }}
              >
                {subtitle}
              </Typography>
            )}
          </Box>
          {actionButton}
        </Box>
      )}

      {tabs && (
        <Box {...tabs.gesture} sx={{ touchAction: "pan-y" }}>
          <UnderlineTabs
            value={tabs.value}
            onChange={tabs.onChange}
            items={tabs.options}
            progress={tabs.progress}
            dragging={tabs.dragging}
          />
        </Box>
      )}
    </Box>
  );
}
