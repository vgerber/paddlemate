import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Snackbar from "@mui/material/Snackbar";
import { useEffect, useState } from "react";
import { watchForUpdate } from "@/lib/reloadOnUpdate";
import { BOTTOM_NAV_SPACE, theme } from "@/lib/theme";

/** Singleton host, mounted once in the root layout. Stays until the person
 * reloads or dismisses it; the page is never reloaded on its own. */
export default function UpdateReadySnackbar() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    watchForUpdate(() => setOpen(true));
  }, []);

  return (
    <Snackbar
      open={open}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      sx={{ bottom: { xs: `calc(${BOTTOM_NAV_SPACE} + 8px)`, md: 24 } }}
    >
      <Alert
        data-testid="update-ready"
        severity="success"
        variant="filled"
        onClose={() => setOpen(false)}
        action={
          <Button
            color="inherit"
            size="small"
            sx={{ minHeight: theme.tokens.touch.min }}
            onClick={() => window.location.reload()}
          >
            Reload
          </Button>
        }
        sx={{ width: "100%", boxShadow: theme.tokens.elevation.e2 }}
      >
        A new version is ready.
      </Alert>
    </Snackbar>
  );
}
