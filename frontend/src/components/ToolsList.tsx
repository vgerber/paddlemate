import MapOutlinedIcon from "@mui/icons-material/MapOutlined";
import RuleOutlinedIcon from "@mui/icons-material/RuleOutlined";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import { Link } from "@tanstack/react-router";
import { useGaugeMap } from "@/lib/hooks/useGauges";
import { useProposals } from "@/lib/hooks/useProposals";

// One entry per tool - adding a tool is a single row here. `as const` keeps
// each `to` a literal route path so the typed Link accepts it.
const TOOLS = [
  {
    to: "/proposals",
    title: "Proposals",
    description: "Review and submit river and section proposals",
    icon: <RuleOutlinedIcon />,
  },
  {
    to: "/tools/gauge-catalog",
    title: "Gauge coverage",
    description:
      "Map of used, fetched and available gauges across every provider",
    icon: <MapOutlinedIcon />,
  },
] as const;

/** The list of available tools with a count behind each. Shared by the desktop
 * `/tools` page and the mobile Tools tab in settings. */
export default function ToolsList() {
  // Pending proposals (all a signed-out user can see anyway) and total gauge
  // points - the latter also warms the map's cache for an instant open.
  const { data: pending } = useProposals({ status: "pending" });
  const { data: gaugePoints } = useGaugeMap();
  const counts: Record<string, number | undefined> = {
    "/proposals": pending?.length,
    "/tools/gauge-catalog": gaugePoints?.length,
  };

  return (
    <List disablePadding sx={{ border: "1px solid", borderColor: "divider" }}>
      {TOOLS.map((tool, i) => {
        const count = counts[tool.to];
        return (
          <ListItemButton
            key={tool.to}
            component={Link}
            to={tool.to}
            sx={
              i > 0
                ? { borderTop: "1px solid", borderColor: "divider" }
                : undefined
            }
          >
            <ListItemIcon sx={{ minWidth: 40 }}>{tool.icon}</ListItemIcon>
            <ListItemText primary={tool.title} secondary={tool.description} />
            {count != null && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ ml: 2, fontVariantNumeric: "tabular-nums" }}
              >
                {count.toLocaleString()}
              </Typography>
            )}
          </ListItemButton>
        );
      })}
    </List>
  );
}
