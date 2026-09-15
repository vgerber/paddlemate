import Box from "@mui/material/Box";
import { theme } from "@/lib/theme";
import SidebarContent from "./SidebarContent";
import type { MapPageState } from "./useMapPageState";

interface DesktopSidebarProps {
  state: MapPageState;
}

/** Sidebar shown only on md+ breakpoints. It widens on larger screens -
 * the lists, gauge rows and feature timeline all truncate at 360px. */
export default function DesktopSidebar({ state }: DesktopSidebarProps) {
  return (
    <Box
      sx={{
        width: { md: 360, lg: 420, xl: 480 },
        display: { xs: "none", md: "flex" },
        flexDirection: "column",
        overflow: "hidden",
        // The same ground and hairline as every other list pane.
        bgcolor: theme.tokens.surfaceLow,
        borderRight: "1px solid",
        borderColor: `${theme.tokens.outlineVariant}55`,
        flexShrink: 0,
      }}
    >
      <SidebarContent state={state} />
    </Box>
  );
}
