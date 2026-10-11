import Box from "@mui/material/Box";
import { theme } from "@/lib/theme";
import SidebarContent from "./SidebarContent";
import type { MapPageState } from "./useMapPageState";

interface DesktopSidebarProps {
  state: MapPageState;
}

/** Side panel shown only on md+ breakpoints. It widens on larger screens -
 * the lists, gauge rows and feature timeline all truncate at 360px. The
 * panel is set apart from the map by its ground, not by a rule. */
export default function DesktopSidebar({ state }: DesktopSidebarProps) {
  return (
    <Box
      data-testid="side-panel"
      sx={{
        width: { md: 360, lg: 420, xl: 480 },
        display: { xs: "none", md: "flex" },
        flexDirection: "column",
        overflow: "hidden",
        bgcolor: theme.tokens.surfaceLow,
        flexShrink: 0,
      }}
    >
      <SidebarContent state={state} />
    </Box>
  );
}
