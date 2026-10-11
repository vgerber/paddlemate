import Button from "@mui/material/Button";
import type { ReactNode } from "react";
import { useSession } from "@/lib/hooks/useSession";
import { theme } from "@/lib/theme";
import StateCard from "./StateCard";

const { tokens } = theme;

/** The one sign-in prompt: a calm card with a line saying what signing in
 * unlocks, "Sign in" and "New here? Create an account". `pt` shrinks it for
 * use inside a panel rather than a page of its own. */
export default function SignInGate({
  icon,
  title,
  pt = 8,
}: {
  icon?: ReactNode;
  title: string;
  pt?: number;
}) {
  const { login, signup } = useSession();
  return (
    <StateCard icon={icon} title={title} pt={pt}>
      <Button
        variant="contained"
        onClick={login}
        sx={{ minHeight: tokens.touch.min }}
      >
        Sign in
      </Button>
      <Button
        onClick={signup}
        sx={{ minHeight: tokens.touch.min, color: "text.secondary" }}
      >
        New here? Create an account
      </Button>
    </StateCard>
  );
}
