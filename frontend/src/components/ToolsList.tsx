import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { Link } from "@tanstack/react-router";
import { withAlpha } from "@/lib/alpha";
import { useGaugeMap } from "@/lib/hooks/useGauges";
import { useProposals } from "@/lib/hooks/useProposals";
import { ListIcon, MapIcon } from "@/lib/icons";
import { transition } from "@/lib/motion";
import { cardTitleSx, theme } from "@/lib/theme";

const { tokens } = theme;
const { phone } = tokens;

// One entry per tool - adding a tool is a single row here. `as const` keeps
// each `to` a literal route path so the typed Link accepts it.
const TOOLS = [
  {
    to: "/proposals",
    title: "Proposals",
    description: "Review and submit river and section proposals",
    icon: <ListIcon />,
  },
  {
    to: "/tools/gauge-catalog",
    title: "Gauge coverage",
    description:
      "Map of used, fetched and available gauges across every provider",
    icon: <MapIcon />,
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
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "minmax(0, 1fr)",
          md: "repeat(2, minmax(0, 1fr))",
        },
        gap: 1.75,
        maxWidth: 700,
      }}
    >
      {TOOLS.map((tool) => {
        const count = counts[tool.to];
        return (
          <Box
            key={tool.to}
            component={Link}
            to={tool.to}
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: `${phone.icon}px minmax(0, 1fr) auto`,
                md: "40px minmax(0, 1fr) auto",
              },
              gap: { xs: `${phone.iconGap}px`, md: 1.5 },
              alignItems: "start",
              minHeight: tokens.touch.min,
              p: 2,
              color: "text.primary",
              textDecoration: "none",
              bgcolor: tokens.surfaceLowest,
              borderRadius: `${tokens.radii.md}px`,
              boxShadow: tokens.elevation.e1,
              transition: transition("box-shadow", { duration: "fast" }),
              "&:hover": { boxShadow: tokens.elevation.e2 },
            }}
          >
            <Box
              data-testid="tool-icon"
              sx={{
                width: { xs: phone.icon, md: 40 },
                height: { xs: phone.icon, md: 40 },
                "& .MuiSvgIcon-root": { fontSize: { xs: 20, md: 24 } },
                display: "grid",
                placeItems: "center",
                borderRadius: `${tokens.radii.row}px`,
                bgcolor: withAlpha(tokens.primary, "hover"),
                color: tokens.primary,
              }}
            >
              {tool.icon}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={cardTitleSx}>{tool.title}</Typography>
              <Typography
                color="textSecondary"
                sx={{ fontSize: "0.875rem", lineHeight: "19px" }}
              >
                {tool.description}
              </Typography>
            </Box>
            {count != null && count > 0 && (
              <Typography
                color="textSecondary"
                sx={{
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {count.toLocaleString()}
              </Typography>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
