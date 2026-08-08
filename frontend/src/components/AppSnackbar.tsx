import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";
import { useEffect, useState } from "react";

type Listener = (message: string) => void;

let listener: Listener | null = null;
let queued: string | null = null;

/** Show an app-wide error snackbar. Callable from anywhere, including the
 * QueryClient's mutation cache - no React context required. */
export function showErrorSnackbar(message: string) {
  if (listener) listener(message);
  // Mounted later (e.g. error during first render): keep the last message.
  else queued = message;
}

/** Singleton snackbar host, mounted once in the root layout. */
export default function AppSnackbar() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    listener = setMessage;
    if (queued) {
      setMessage(queued);
      queued = null;
    }
    return () => {
      listener = null;
    };
  }, []);

  return (
    <Snackbar
      open={message !== null}
      autoHideDuration={6000}
      onClose={() => setMessage(null)}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      // Above the mobile bottom navigation (56px + safe area).
      sx={{
        bottom: { xs: "calc(64px + env(safe-area-inset-bottom))", md: 24 },
      }}
    >
      <Alert
        severity="error"
        variant="filled"
        onClose={() => setMessage(null)}
        sx={{ width: "100%" }}
      >
        {message}
      </Alert>
    </Snackbar>
  );
}
