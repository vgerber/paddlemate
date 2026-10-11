import useMediaQuery from "@mui/material/useMediaQuery";
import { theme } from "@/lib/theme";

/** The word for acting on the map: a finger taps, a pointer clicks. `md` is
 * the app's phone-versus-desktop switch. */
export function useMapVerb(): "Tap" | "Click" {
  return useMediaQuery(theme.breakpoints.up("md")) ? "Click" : "Tap";
}
