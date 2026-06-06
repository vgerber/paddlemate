import Box from "@mui/material/Box";
import SidebarContent from "./SidebarContent";
import type { MapPageState } from "./useMapPageState";

interface DesktopSidebarProps {
  state: MapPageState;
}

/** Fixed-width sidebar shown only on md+ breakpoints. */
export default function DesktopSidebar({ state }: DesktopSidebarProps) {
  return (
    <Box
      sx={{
        width: 360,
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
