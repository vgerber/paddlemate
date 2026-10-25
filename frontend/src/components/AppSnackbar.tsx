import Alert from "@mui/material/Alert";
import Fade from "@mui/material/Fade";
import Snackbar, { type SnackbarProps } from "@mui/material/Snackbar";
import {
  type CSSProperties,
  forwardRef,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import {
  css,
  durations,
  REDUCED_FADE_MS,
  useReducedMotion,
} from "@/lib/motion";
import { BOTTOM_NAV_SPACE, theme } from "@/lib/theme";

const RISE_PX = 8;
const ENTER_MS = durations.fast;
// Leaving is quicker than arriving: 70% of the enter time.
const EXIT_MS = Math.round(ENTER_MS * 0.7);

const Rise = forwardRef<
  HTMLDivElement,
  { style?: CSSProperties; children?: ReactNode; reduced: boolean }
>(function Rise({ style, children, reduced }, ref) {
  const leaving = style?.opacity === 0;
  const time = leaving ? EXIT_MS : ENTER_MS;
  const easing = leaving ? css.easeIn : css.easeOut;
  return (
    <div
      ref={ref}
      data-snackbar-rise
      style={{
        ...style,
        width: "100%",
        transform: leaving && !reduced ? `translateY(${RISE_PX}px)` : "none",
        transition: reduced
          ? `opacity ${REDUCED_FADE_MS}ms linear`
          : `opacity ${time}ms ${easing}, transform ${time}ms ${easing}`,
      }}
    >
      {children}
    </div>
  );
});

/** Fade and an 8px rise: ease out in, 70% of the time and ease in out.
 * Reduced motion keeps only the short fade. */
const RiseFade: NonNullable<SnackbarProps["slots"]>["transition"] = forwardRef(
  function RiseFade({ children, in: show, onExited, onEnter }, ref) {
    const reduced = useReducedMotion();
    return (
      <Fade
        ref={ref}
        appear
        in={show}
        onExited={onExited}
        onEnter={onEnter}
        timeout={reduced ? REDUCED_FADE_MS : { enter: ENTER_MS, exit: EXIT_MS }}
        // The Rise wrapper sets the transition itself.
        easing={css.easeOut}
      >
        <Rise reduced={reduced}>{children}</Rise>
      </Fade>
    );
  },
);

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
      slots={{ transition: RiseFade }}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      // Above the mobile bottom navigation plus 8px.
      sx={{
        bottom: { xs: `calc(${BOTTOM_NAV_SPACE} + 8px)`, md: 24 },
      }}
    >
      <Alert
        severity="error"
        variant="filled"
        onClose={() => setMessage(null)}
        sx={{ width: "100%", boxShadow: theme.tokens.elevation.e2 }}
      >
        {message}
      </Alert>
    </Snackbar>
  );
}
