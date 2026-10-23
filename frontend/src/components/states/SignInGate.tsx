import Button from "@mui/material/Button";
import type { ReactNode } from "react";
import CanvasLayout from "@/components/canvas/CanvasLayout";
import { useOverlay } from "@/components/canvas/canvasStore";
import FloatingCard from "@/components/canvas/FloatingCard";
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
  floating = false,
}: {
  icon?: ReactNode;
  title: string;
  pt?: number;
  /** A page-level gate on a canvas route: on the desktop canvas it sits in
   * a card above the map instead of under it. */
  floating?: boolean;
}) {
  const { login, signup } = useSession();
  const overlay = useOverlay();
  const onCanvas = floating && overlay != null;
  const gate = (
    <StateCard icon={icon} title={title} pt={onCanvas ? 2 : pt} flat={onCanvas}>
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
  if (!onCanvas) return gate;
  return (
    <CanvasLayout>
      <FloatingCard
        id="gate"
        side="left"
        kind="list"
        title="Sign in"
        selfHeaded
      >
        {gate}
      </FloatingCard>
    </CanvasLayout>
  );
}
