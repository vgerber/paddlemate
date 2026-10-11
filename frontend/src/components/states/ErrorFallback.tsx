import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlineOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { apiErrorMessage } from "@/lib/api/client";
import { StateTile } from "./EmptyState";

/** Route-level error boundary screen: shown instead of a blank page when a
 * route component throws. Wired as the router's defaultErrorComponent. */
export default function ErrorFallback({ error }: { error: unknown }) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1,
        pt: 10,
        px: 2,
        textAlign: "center",
      }}
    >
      <StateTile>
        <ErrorOutlineIcon />
      </StateTile>
      <Typography variant="h6">Something went wrong</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {apiErrorMessage(error, "An unexpected error occurred.")}
      </Typography>
      <Button variant="contained" onClick={() => window.location.reload()}>
        Reload
      </Button>
    </Box>
  );
}
