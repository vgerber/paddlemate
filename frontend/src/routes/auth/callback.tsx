import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlineOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import LoadingBox from "@/components/states/LoadingBox";
import { getUserManager } from "@/lib/auth";
import { EMPTY_MAP_SEARCH } from "@/lib/mapSearch";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallback,
});

/** OAuth redirect target: completes the sign-in and returns to the map. */
function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  // StrictMode double-invokes effects; the token exchange must run once.
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    getUserManager()
      .signinRedirectCallback()
      .then(() => navigate({ to: "/", search: EMPTY_MAP_SEARCH }))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Authentication failed");
      });
  }, [navigate]);

  if (error) {
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
          Sign-in failed
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {error}
        </Typography>
        <Button
          variant="contained"
          color="secondary"
          onClick={() => navigate({ to: "/", search: EMPTY_MAP_SEARCH })}
        >
          Go home
        </Button>
      </Box>
    );
  }

  return <LoadingBox size={40} pt={10} />;
}
