import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import type { HTMLAttributes, ReactNode } from "react";
import { theme } from "@/lib/theme";
import UnderlineTabs from "./UnderlineTabs";

const { tokens } = theme;
const { panel } = tokens.canvas;

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
        // A titled header is the section panel's 56 + 48 from md; the tab
        // bar alone keeps its 16 inset.
        px: { xs: 2, md: title ? 0 : 2 },
        pt: { xs: title ? 1.5 : 0, md: 0 },
        pb: { xs: tabs ? 0 : 1, md: tabs ? 0 : 1 },
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
            mb: { xs: tabs ? 0.75 : 0, md: 0 },
            // From md the title row is one 56 row: back box at +12, title
            // text at +64, the last action box ends 12 from the edge.
            minHeight: { md: panel.headerRow },
            pl: { md: `${panel.hitEdge}px` },
            pr: { md: `${panel.hitEdge}px` },
          }}
        >
          {onBack && (
            <IconButton
              onClick={onBack}
              sx={{
                width: tokens.touch.min,
                height: tokens.touch.min,
                ml: { xs: -0.75, md: 0 },
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
        <Box
          {...tabs.gesture}
          sx={{
            touchAction: "pan-y",
            // The first label starts on the 24 line (tab padding is 4).
            pl: { md: title ? `${panel.line - 4}px` : 0 },
            minHeight: { md: title ? panel.tabRow : undefined },
          }}
        >
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
