import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { createFileRoute } from "@tanstack/react-router";
import ToolsList from "@/components/ToolsList";

export const Route = createFileRoute("/tools/")({
  component: ToolsPage,
});

function ToolsPage() {
  return (
    <Box sx={{ maxWidth: 720, mx: "auto", px: 2, py: 3 }}>
      <Typography variant="h6">Tools</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Utilities for exploring and maintaining Paddlemate's data.
      </Typography>
      <ToolsList />
    </Box>
  );
}
