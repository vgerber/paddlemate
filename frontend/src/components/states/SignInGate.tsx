import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { useSession } from "@/lib/hooks/useSession";
import { StateTile } from "./EmptyState";

/** Sign-in prompt: icon in a soft tile, one line, sign-in button. `pt` shrinks
 * it for use inside a panel rather than a full page. */
export default function SignInGate({
  icon,
  title,
  pt = 10,
}: {
  icon: ReactNode;
  title: string;
  pt?: number;
}) {
  const { login, signup } = useSession();
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1,
        pt,
        px: 2,
        textAlign: "center",
      }}
    >
      <StateTile>{icon}</StateTile>
      <Typography variant="h6" sx={{ mb: 1 }}>
        {title}
      </Typography>
      <Button variant="contained" onClick={login}>
        Sign In
      </Button>
      <Link
        component="button"
        type="button"
        variant="body2"
        color="text.secondary"
        onClick={signup}
        sx={{ minHeight: 44 }}
      >
        New here? Create an account
      </Link>
    </Box>
  );
}
