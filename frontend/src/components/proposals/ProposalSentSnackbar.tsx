import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Snackbar from "@mui/material/Snackbar";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BOTTOM_NAV_SPACE, theme } from "@/lib/theme";

type Listener = (id: number | null) => void;

let listener: Listener | null = null;

/** Tell the person their change went to review, not live. Callable from a
 * mutation hook; `id` links to the proposal when the API sent one. */
export function announceProposalSent(id: number | null) {
  listener?.(id);
}

/** A response that is a proposal rather than the changed thing itself. */
export function proposalIdOf(result: unknown): number | null {
  if (
    typeof result === "object" &&
    result !== null &&
    "proposed_data" in result &&
    "id" in result &&
    typeof result.id === "number"
  ) {
    return result.id;
  }
  return null;
}

/** Singleton host for the confirmation, mounted once in the root layout. */
export default function ProposalSentSnackbar() {
  const [open, setOpen] = useState(false);
  const [id, setId] = useState<number | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    listener = (next) => {
      setId(next);
      setOpen(true);
    };
    return () => {
      listener = null;
    };
  }, []);

  return (
    <Snackbar
      open={open}
      autoHideDuration={6000}
      onClose={(_, reason) => {
        if (reason !== "clickaway") setOpen(false);
      }}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      sx={{ bottom: { xs: `calc(${BOTTOM_NAV_SPACE} + 8px)`, md: 24 } }}
    >
      <Alert
        data-testid="proposal-sent"
        severity="success"
        variant="filled"
        onClose={() => setOpen(false)}
        action={
          id == null ? undefined : (
            <Button
              color="inherit"
              size="small"
              sx={{ minHeight: theme.tokens.touch.min }}
              onClick={() => {
                setOpen(false);
                navigate({
                  to: "/proposals/$proposalId",
                  params: { proposalId: String(id) },
                });
              }}
            >
              View
            </Button>
          )
        }
        sx={{ width: "100%", boxShadow: theme.tokens.elevation.e2 }}
      >
        Sent for review. An admin will take a look.
      </Alert>
    </Snackbar>
  );
}

/** Announce a write's result when the server held it for review. */
export function announceIfProposal(result: unknown) {
  const id = proposalIdOf(result);
  if (id != null) announceProposalSent(id);
}
