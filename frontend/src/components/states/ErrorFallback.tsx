import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlineOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { apiErrorMessage } from "@/lib/api/client";

/** Route-level error boundary screen: shown instead of a blank page when a
 * route component throws. Wired as the router's defaultErrorComponent. */
export default function ErrorFallback({ error }: { error: unknown }) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        pt: 10,
        px: 2,
        textAlign: "center",
      }}
    >
      <ErrorOutlineIcon sx={{ fontSize: 56, color: "text.disabled" }} />
      <Typography variant="h6" color="text.secondary">
        Something went wrong
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {apiErrorMessage(error, "An unexpected error occurred.")}
      </Typography>
      <Button
        variant="contained"
        color="secondary"
        onClick={() => window.location.reload()}
      >
        Reload
      </Button>
    </Box>
  );
}
