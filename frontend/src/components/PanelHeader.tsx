import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import type { HTMLAttributes, ReactNode } from "react";
import type { SwipeTrack } from "@/lib/hooks/useSwipeTabs";
import { BackIcon, CloseIcon } from "@/lib/icons";
import { theme } from "@/lib/theme";
import UnderlineTabs from "./UnderlineTabs";

const { tokens } = theme;
const { panel } = tokens.canvas;
const { phone } = tokens;

/** The back arrow is a 44 box around a 22 icon; it hangs out so the icon
 * starts on the phone's text line, and the title follows on the name line. */
const BACK_ICON = 22;
const backHang = (tokens.touch.min - BACK_ICON) / 2;
const titleGap = phone.nameLine - (phone.line - backHang + tokens.touch.min);

const ACTION_ICON = 24;

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
    track?: SwipeTrack;
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
        px: { xs: 0, md: title ? 0 : 2 },
        pb: { xs: 0, md: tabs ? 0 : 1 },
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
            gap: { xs: `${titleGap}px`, md: 1 },
            // The title row is one 56 row on every screen (104 with the
            // tabs): back box at +12 (md), title text at +64, the last action
            // box ends 12 from the edge.
            minHeight: panel.headerRow,
            pl: { xs: `${phone.line}px`, md: `${panel.hitEdge}px` },
            pr: { xs: `${phone.line}px`, md: `${panel.hitEdge}px` },
          }}
        >
          {onBack && (
            <IconButton
              onClick={onBack}
              data-panel-back
              sx={{
                width: tokens.touch.min,
                height: tokens.touch.min,
                ml: { xs: `-${backHang}px`, md: 0 },
              }}
              aria-label={backIcon === "close" ? "Close" : "Back"}
            >
              {backIcon === "close" ? (
                <CloseIcon sx={backIconSx} />
              ) : (
                <BackIcon sx={backIconSx} />
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
                noWrap
                color="textSecondary"
                sx={{ fontSize: "0.8125rem", lineHeight: "18px" }}
              >
                {subtitle}
              </Typography>
            )}
          </Box>
          {actionButton && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                // The last button hangs out so its icon ends on the right line.
                mr: { xs: `-${phone.trailInset}px`, md: 0 },
                // Every action icon is 24, whatever the caller passes.
                "& .MuiSvgIcon-root": { fontSize: ACTION_ICON },
              }}
            >
              {actionButton}
            </Box>
          )}
        </Box>
      )}

      {tabs && (
        <Box
          {...tabs.gesture}
          sx={{
            touchAction: "pan-y",
            // The first label starts on the 24 line (tab padding is 4).
            pl: {
              xs: `${phone.line - 4}px`,
              md: title ? `${panel.line - 4}px` : 0,
            },
            minHeight: { md: title ? panel.tabRow : undefined },
          }}
        >
          <UnderlineTabs
            value={tabs.value}
            onChange={tabs.onChange}
            items={tabs.options}
            track={tabs.track}
          />
        </Box>
      )}
    </Box>
  );
}
