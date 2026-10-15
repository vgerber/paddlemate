import Box from "@mui/material/Box";
import { useMemo, useState } from "react";
import BottomSheet from "@/components/BottomSheet";
import { OPEN_RATIO } from "@/lib/sheetSnap";
import { theme } from "@/lib/theme";
import { modeSheetPeek, type SheetMode } from "./modeSheet";
import SidebarContent from "./SidebarContent";
import type { MapPageState } from "./useMapPageState";

const { tokens } = theme;

interface SearchSheetProps {
  state: MapPageState;
  mode: SheetMode;
}

/** The phone's area and region search: a peek sheet over the map instead of
 * a screen, because those searches are made by looking at the map. At rest it
 * shows the mode tabs and the mode's own control; pulled up it shows the
 * results. Back to Name, the overlay returns. */
export default function SearchSheet({ state, mode }: SearchSheetProps) {
  const [sheetState, setSheetState] = useState<"peek" | "open">("peek");
  const sheet = useMemo(() => ({ onState: setSheetState }), []);

  return (
    <BottomSheet
      state={sheetState}
      onStateChange={(next) => setSheetState(next === "open" ? "open" : "peek")}
      label="Search"
      peekHeight={modeSheetPeek(mode)}
    >
      <Box
        data-testid="mode-sheet"
        sx={{
          // The open sheet's height less the handle: the panel scrolls its
          // own list, the sheet does not.
          height: `calc(${OPEN_RATIO * 100}dvh - ${tokens.touch.min}px)`,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <SidebarContent state={state} sheet={sheet} />
      </Box>
    </BottomSheet>
  );
}
