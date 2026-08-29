import Box from "@mui/material/Box";
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
        borderRight: "1px solid",
        borderColor: "divider",
        flexShrink: 0,
      }}
    >
      <SidebarContent state={state} />
    </Box>
  );
}
