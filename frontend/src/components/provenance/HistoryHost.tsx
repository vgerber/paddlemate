import Box from "@mui/material/Box";
import Portal from "@mui/material/Portal";
import useMediaQuery from "@mui/material/useMediaQuery";
import type { ReactNode } from "react";
import BottomSheet from "@/components/BottomSheet";
import PanelHeader from "@/components/PanelHeader";
import { theme } from "@/lib/theme";
import HistoryTimeline from "./HistoryTimeline";
import type { HistoryTarget } from "./types";

interface Props {
  /** Whose history is open; null while none is. */
  target: HistoryTarget | null;
  /** What the history is of, as the reader names it: the feature, the section. */
  name: string;
  onClose: () => void;
  children: ReactNode;
}

/** Opens a history over its list: a bottom sheet on a phone, the detail
 * pane itself on a desktop (the list is put back with the back arrow). */
export default function HistoryHost({
  target,
  name,
  onClose,
  children,
}: Props) {
  const desktop = useMediaQuery(theme.breakpoints.up("md"));
  if (target && desktop) {
    return (
      <Box data-testid="history-pane">
        <PanelHeader title="History" subtitle={name} onBack={onClose} />
        <HistoryTimeline target={target} />
      </Box>
    );
  }
  return (
    <>
      {children}
      {/* Out of the panel: the mobile overlay slides by transform, which
          would make the sheet's fixed position relative to the overlay. */}
      <Portal>
        <BottomSheet
          state={target ? "open" : "closed"}
          onStateChange={onClose}
          label="History"
        >
          {target && (
            <>
              <PanelHeader
                title="History"
                subtitle={name}
                onBack={onClose}
                backIcon="close"
              />
              <HistoryTimeline target={target} />
            </>
          )}
        </BottomSheet>
      </Portal>
    </>
  );
}
