import Box from "@mui/material/Box";
import Portal from "@mui/material/Portal";
import useMediaQuery from "@mui/material/useMediaQuery";
import type { ReactNode } from "react";
import PanelHeader from "@/components/PanelHeader";
import { theme } from "@/lib/theme";
import HistoryTimeline from "./HistoryTimeline";
import type { HistoryTarget } from "./types";

const { tokens } = theme;

interface Props {
  /** Whose history is open; null while none is. */
  target: HistoryTarget | null;
  /** What the history is of, as the reader names it: the feature, the section. */
  name: string;
  /** The line under the name: "Hole · Lower Test, 0.4 km". */
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}

/** Opens a history as its own panel over its list: full screen on a phone,
 * the detail pane itself on a desktop. The back arrow puts the list back. */
export default function HistoryHost({
  target,
  name,
  subtitle,
  onClose,
  children,
}: Props) {
  const desktop = useMediaQuery(theme.breakpoints.up("md"));
  if (target && desktop) {
    return (
      <Box data-testid="history-pane">
        <PanelHeader title={name} subtitle={subtitle} onBack={onClose} />
        <HistoryTimeline target={target} />
      </Box>
    );
  }
  return (
    <>
      {children}
      {/* Out of the panel: the mobile overlay slides by transform, which
          would make a fixed position relative to the overlay. Above that
          overlay, below dialogs. */}
      {target && (
        <Portal>
          <Box
            role="dialog"
            aria-label="History"
            data-testid="history-panel"
            sx={{
              position: "fixed",
              inset: 0,
              zIndex: 1250,
              display: "flex",
              flexDirection: "column",
              bgcolor: tokens.background,
            }}
          >
            <PanelHeader title={name} subtitle={subtitle} onBack={onClose} />
            <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
              <HistoryTimeline target={target} />
            </Box>
          </Box>
        </Portal>
      )}
    </>
  );
}
