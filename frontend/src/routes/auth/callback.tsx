import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlineOutlined";
import Button from "@mui/material/Button";
import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import LoadingBox from "@/components/states/LoadingBox";
import StateCard from "@/components/states/StateCard";
import { getUserManager } from "@/lib/auth";
import { EMPTY_MAP_SEARCH } from "@/lib/mapSearch";
import { safeReturnTo } from "@/lib/returnTo";
import { theme } from "@/lib/theme";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallback,
});

/** OAuth redirect target: completes the sign-in and returns to the map. */
function AuthCallback() {
  const navigate = useNavigate();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // StrictMode double-invokes effects; the token exchange must run once.
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    getUserManager()
      .signinRedirectCallback()
      .then((user) => {
        // Back to the page sign-in started from - an invite link, a trip -
        // when it is a page on this site; the map otherwise.
        const to = safeReturnTo(user.state);
        if (to) router.history.replace(to);
        else navigate({ to: "/", search: EMPTY_MAP_SEARCH });
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Authentication failed");
      });
  }, [navigate, router]);

  if (error) {
    return (
      <StateCard
        icon={<ErrorOutlineIcon />}
        title="Sign-in failed"
        caption={error}
      >
        <Button
          variant="contained"
          sx={{ minHeight: theme.tokens.touch.min }}
          onClick={() => navigate({ to: "/", search: EMPTY_MAP_SEARCH })}
        >
          Go home
        </Button>
      </StateCard>
    );
  }

  return <LoadingBox size={40} pt={10} />;
}
