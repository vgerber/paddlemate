import useMediaQuery from "@mui/material/useMediaQuery";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { theme } from "@/lib/theme";

/** Mobile overlay visibility: URL-driven open state (so the browser back
 * button walks back through overlay history) plus the map-view toggle that
 * hides the overlay while keeping the selection. */
export function useMobilePanelState(
  panel: "1" | undefined,
  selectedWaterwayId: number | undefined,
) {
  const navigate = useNavigate({ from: "/" });
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  // isMobileMapView lets the user toggle the overlay away to see the map
  // while keeping the section selected. Auto-resets when deselected.
  const [isMobileMapViewRaw, setIsMobileMapViewRaw] = useState(false);
  const isMobileMapView = isMobileMapViewRaw && selectedWaterwayId != null;
  const toggleMobileMapView = useCallback(
    () => setIsMobileMapViewRaw((v) => !v),
    [],
  );

  // URL-driven: FAB -> /?panel=1 -> /?panel=1&waterway=123 -> back -> back
  const setIsMobilePanelOpen = useCallback(
    (open: boolean) => {
      if (open) {
        setIsMobileMapViewRaw(false); // overlay must be visible when opening
        navigate({ search: (prev) => ({ ...prev, panel: "1" }) });
      } else {
        navigate({
          search: (prev) => ({
            ...prev,
            panel: undefined,
            waterway: undefined,
            section: undefined,
          }),
        });
      }
    },
    [navigate],
  );
  const isMobilePanelOpen =
    isMobile &&
    (panel === "1" || selectedWaterwayId != null) &&
    !isMobileMapView;

  /** Bring the overlay back without touching the URL (e.g. suggest mode). */
  const exitMapView = useCallback(() => setIsMobileMapViewRaw(false), []);

  return {
    isMobile,
    isMobileMapView,
    toggleMobileMapView,
    isMobilePanelOpen,
    setIsMobilePanelOpen,
    exitMapView,
  };
}
