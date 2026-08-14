import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { useSession } from "@/lib/hooks/useSession";

/** Full-page sign-in prompt: disabled icon, one line, sign-in button. */
export default function SignInGate({
  icon,
  title,
}: {
  icon: ReactNode;
  title: string;
}) {
  const { login, signup } = useSession();
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        pt: 10,
        px: 2,
      }}
    >
      {icon}
      <Typography variant="h6" color="text.secondary">
        {title}
      </Typography>
      <Button variant="contained" color="secondary" onClick={login}>
        Sign In
      </Button>
      <Link
        component="button"
        type="button"
        variant="body2"
        color="text.secondary"
        onClick={signup}
      >
        New here? Create an account
      </Link>
    </Box>
  );
}
