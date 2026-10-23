const THROTTLE_MS = 600;

let region: HTMLElement | null = null;
let pending: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

function liveRegion(): HTMLElement {
  if (region?.isConnected) return region;
  region = document.createElement("div");
  region.setAttribute("role", "status");
  region.setAttribute("aria-live", "polite");
  region.setAttribute("aria-atomic", "true");
  region.setAttribute("data-testid", "chart-live-region");
  // Visually hidden, still read by screen readers.
  // (MUI's `visuallyHidden` lives in @mui/utils, which is not a direct
  // dependency, so the five properties are spelled out.)
  Object.assign(region.style, {
    position: "absolute",
    width: "1px",
    height: "1px",
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  });
  document.body.appendChild(region);
  return region;
}

/** Says a chart readout through the one shared polite live region. Calls
 * inside the throttle window collapse to the last message, so scrubbing or
 * holding an arrow key does not chatter. */
export function announce(message: string) {
  pending = message;
  if (timer) return;
  const flush = () => {
    timer = null;
    if (pending == null) return;
    liveRegion().textContent = pending;
    pending = null;
    timer = setTimeout(() => {
      timer = null;
      if (pending != null) flush();
    }, THROTTLE_MS);
  };
  flush();
}

/** Drops a pending readout and the throttle timer, for a chart that unmounts. */
export function cancelAnnounce() {
  if (timer) clearTimeout(timer);
  timer = null;
  pending = null;
}
