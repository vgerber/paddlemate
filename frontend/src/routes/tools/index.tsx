import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { createFileRoute } from "@tanstack/react-router";
import PanelHeader from "@/components/PanelHeader";
import ToolsList from "@/components/ToolsList";
import { theme } from "@/lib/theme";

const { phone } = theme.tokens;

export const Route = createFileRoute("/tools/")({
  component: ToolsPage,
});

function ToolsPage() {
  return (
    <>
      <Box sx={{ display: { md: "none" } }}>
        <PanelHeader title="Tools" />
      </Box>
      <Box
        sx={{
          maxWidth: 880,
          mx: "auto",
          px: { xs: 1.5, md: 2 },
          py: { xs: 2, md: 3 },
        }}
      >
        <Box sx={{ px: { xs: `${phone.inner}px`, md: 0 } }}>
          <Typography
            variant="h3"
            sx={{ display: { xs: "none", md: "block" } }}
          >
            Tools
          </Typography>
          <Typography
            color="textSecondary"
            sx={{ mb: 2.5, fontSize: "0.9375rem", lineHeight: "20px" }}
          >
            Utilities for exploring and maintaining Paddlemate's data.
          </Typography>
        </Box>
        <ToolsList />
      </Box>
    </>
  );
}
