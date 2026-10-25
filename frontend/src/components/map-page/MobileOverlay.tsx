import Box from "@mui/material/Box";
import Slide from "@mui/material/Slide";
import { useEffect, useRef } from "react";
import StandingDescentBanner from "@/components/StandingDescentBanner";
import { usePanelEnter } from "@/components/usePanelEnter";
import { durations } from "@/lib/motion";
import { BOTTOM_NAV_SPACE, theme } from "@/lib/theme";
import { modeSheetMode } from "./modeSheet";
import SearchSheet from "./SearchSheet";
import SectionSpeedDial from "./SectionSpeedDial";
import SidebarContent from "./SidebarContent";
import type { MapPageState } from "./useMapPageState";

const { tokens } = theme;

interface MobileOverlayProps {
  state: MapPageState;
}

/**
 * Full-screen overlay shown on mobile when the panel is open.
 * Sits above the map (z-index 1200, or 1350 as a suggest sheet), below the app bar, above the bottom nav.
 */
export default function MobileOverlay({ state }: MobileOverlayProps) {
  const {
    isMobilePanelOpen,
    setIsMobilePanelOpen,
    isMobileMapView,
    toggleMobileMapView,
    suggestMode,
  } = state;

  const overlay = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    // Focus moves into the panel on open and back to what opened it.
    if (isMobilePanelOpen) {
      const active = document.activeElement as HTMLElement | null;
      opener.current = active === document.body ? null : active;
      if (!overlay.current?.contains(active)) overlay.current?.focus();
      return;
    }
    if (opener.current?.isConnected) opener.current.focus();
    opener.current = null;
  }, [isMobilePanelOpen]);

  // Opening a river pushes the detail in from the right; going back brings
  // the list in from where it stepped back to.
  const content = useRef<HTMLDivElement>(null);
  const stage = state.selectedWaterwayId == null ? "list" : "detail";
  // The slow step: on the out curve the push has 5 px left at 100 ms only
  // when it takes 360.
  usePanelEnter(content, stage, {
    from: stage === "detail" ? { x: 40 } : { x: -16, opacity: 0.55 },
    duration: durations.slow,
  });

  const sheetMode = modeSheetMode(state);
  if (sheetMode) return <SearchSheet state={state} mode={sheetMode} />;

  const closeOverlay = () => setIsMobilePanelOpen(false);
  // Sheet mode: the map above must stay reachable - suggest flows, and
  // placing a note pin.
  const sheet = Boolean(suggestMode) || state.notePinPlacing;

  return (
    <Slide
      direction="up"
      in={isMobilePanelOpen}
      easing={{ enter: tokens.motion.easeOut, exit: tokens.motion.easeIn }}
      timeout={{ enter: durations.base, exit: durations.fast }}
    >
      <Box
        ref={overlay}
        data-testid="mobile-overlay"
        role="dialog"
        aria-label="Panel"
        tabIndex={-1}
        onKeyDown={(e) => {
          // React bubbles keys from portals (the filters sheet, menus) up
          // here; their Escape closes only themselves.
          const inside = e.currentTarget.contains(e.target as Node);
          if (e.key === "Escape" && inside && !e.defaultPrevented) {
            closeOverlay();
          }
        }}
        sx={{
          outline: "none",
          display: { xs: "flex", md: "none" },
          position: "fixed",
          top: sheet ? "45%" : 0,
          bottom: sheet ? 0 : BOTTOM_NAV_SPACE,
          left: 0,
          right: 0,
          zIndex: sheet ? 1350 : 1200,
          flexDirection: "column",
          bgcolor: "background.default",
          overflow: "hidden",
          borderTopLeftRadius: sheet ? `${tokens.radii.xl}px` : 0,
          borderTopRightRadius: sheet ? `${tokens.radii.xl}px` : 0,
          boxShadow: sheet ? tokens.elevation.e2 : "none",
        }}
      >
        {/* Sheet-style top edge in suggest mode: a fixed handle strip the
            content scrolls beneath, instead of a hard cut against the map. */}
        {sheet && (
          <Box
            sx={{
              flexShrink: 0,
              display: "flex",
              justifyContent: "center",
              pt: 1,
              pb: 0.75,
              bgcolor: "background.paper",
            }}
          >
            <Box
              sx={{
                width: 36,
                height: 4,
                borderRadius: `${tokens.radii.pill}px`,
                bgcolor: tokens.outlineVariant,
              }}
            />
          </Box>
        )}
        <Box
          ref={content}
          data-testid="overlay-content"
          sx={{
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <StandingDescentBanner />
          <SidebarContent
            state={state}
            onClose={closeOverlay}
            onMobileMapToggle={toggleMobileMapView}
            mobileMapActive={isMobileMapView}
          />
        </Box>

        <SectionSpeedDial
          state={state}
          sx={{
            position: "absolute",
            bottom: 16,
            right: 16,
          }}
        />
      </Box>
    </Slide>
  );
}
