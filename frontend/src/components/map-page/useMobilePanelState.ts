import useMediaQuery from "@mui/material/useMediaQuery";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { theme } from "@/lib/theme";

/** Mobile overlay visibility: URL-driven open state (so the browser back
 * button walks back through overlay history) plus the map-view toggle that
 * hides the overlay while keeping the selection. */
export function useMobilePanelState(
  panel: true | undefined,
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

  // URL-driven: FAB -> /?panel=true -> /?panel=true&waterway=123 -> back
  const setIsMobilePanelOpen = useCallback(
    (open: boolean) => {
      if (open) {
        setIsMobileMapViewRaw(false); // overlay must be visible when opening
        navigate({ search: (prev) => ({ ...prev, panel: true }) });
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
    (panel === true || selectedWaterwayId != null) &&
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
