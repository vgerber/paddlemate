import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import Fade from "@mui/material/Fade";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { type KeyboardEvent, type TouchEvent, useRef, useState } from "react";
import { lockDirection } from "@/lib/gestures/swipe";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from "@/lib/icons";
import { withAlpha } from "@/lib/theme/alpha";
import { durations, useReducedMotion } from "@/lib/theme/motion";
import { theme } from "@/lib/theme/theme";

const { tokens } = theme;

/** Pixels a horizontal drag must pass to turn the page. */
const SWIPE_COMMIT_PX = 50;

export interface ViewerPhoto {
  id: number | string;
  /** The full-size file. */
  src: string;
  alt: string;
  credit?: string;
  /** Where the credit links to. */
  creditUrl?: string;
}

const navSx = {
  position: "absolute",
  top: "50%",
  transform: "translateY(-50%)",
  width: tokens.touch.min,
  height: tokens.touch.min,
  bgcolor: withAlpha(tokens.surfaceLowest, "scrim"),
  boxShadow: tokens.elevation.e1,
  "&:hover": { bgcolor: tokens.surfaceHigh },
} as const;

function PhotoStage({ photo }: { photo: ViewerPhoto }) {
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  return (
    <>
      {state === "loading" && (
        <CircularProgress
          size={32}
          aria-label="Loading photo"
          sx={{ position: "absolute", inset: 0, m: "auto" }}
        />
      )}
      {state === "failed" ? (
        <Typography variant="body2" sx={{ color: tokens.onSurfaceVariant }}>
          The photo could not be loaded.
        </Typography>
      ) : (
        <Box
          component="img"
          src={photo.src}
          alt={photo.alt}
          draggable={false}
          onLoad={() => setState("ready")}
          onError={() => setState("failed")}
          sx={{
            display: "block",
            maxWidth: "100%",
            maxHeight: "100%",
            objectFit: "contain",
            opacity: state === "ready" ? 1 : 0,
          }}
        />
      )}
    </>
  );
}

/** Full-size viewer for a set of photos: a dialog that fills a phone and
 * floats over a dimmed backdrop on a desktop. Previous/next by button, arrow
 * key or swipe; Escape and the close button close it and focus goes back to
 * the photo that opened it (MUI restores it to the trigger). The stage has a
 * fixed size, so nothing shifts while a file loads. `index` null is closed. */
export default function PhotoViewer({
  photos,
  index,
  onIndexChange,
  onClose,
}: {
  photos: ViewerPhoto[];
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const reduced = useReducedMotion();
  const phone = useMediaQuery(theme.breakpoints.down("md"));
  const touch = useRef<{ x: number; y: number } | null>(null);
  const open = index !== null && photos[index] !== undefined;
  const current = open ? photos[index] : null;
  const many = photos.length > 1;

  const go = (step: number) => {
    if (index === null || !many) return;
    onIndexChange((index + step + photos.length) % photos.length);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") go(-1);
    else if (e.key === "ArrowRight") go(1);
    else return;
    e.preventDefault();
  };

  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    touch.current = t ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchEnd = (e: TouchEvent) => {
    const start = touch.current;
    const t = e.changedTouches[0];
    touch.current = null;
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (lockDirection(dx, dy) !== "horizontal") return;
    if (Math.abs(dx) >= SWIPE_COMMIT_PX) go(dx < 0 ? 1 : -1);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      onKeyDown={onKeyDown}
      fullScreen={phone}
      maxWidth={false}
      transitionDuration={reduced ? 0 : durations.fast}
      // Above the app's own overlays (mobile sheet and suggest chrome: 1350).
      sx={{ zIndex: theme.zIndex.modal + 100 }}
      slotProps={{
        paper: {
          "aria-label": "Photo viewer",
          sx: {
            bgcolor: tokens.surfaceLowest,
            borderRadius: phone ? 0 : `${tokens.radii.lg}px`,
            overflow: "hidden",
            width: phone ? "100%" : "min(1200px, 96vw)",
            height: phone ? "100%" : "min(90vh, 900px)",
            m: 0,
            display: "flex",
            flexDirection: "column",
          },
        },
      }}
    >
      {current && (
        <>
          <Box
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            sx={{
              position: "relative",
              flex: 1,
              minHeight: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: tokens.surfaceHigh,
              touchAction: "pan-y",
            }}
          >
            <Fade in key={current.id} timeout={reduced ? 0 : durations.fast}>
              <Box
                data-testid="photo-viewer-stage"
                sx={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <PhotoStage photo={current} />
              </Box>
            </Fade>
            <IconButton
              aria-label="Close"
              onClick={onClose}
              sx={{ ...navSx, top: 8, right: 8, transform: "none" }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
            {many && (
              <>
                <IconButton
                  aria-label="Previous photo"
                  onClick={() => go(-1)}
                  sx={{ ...navSx, left: 8 }}
                >
                  <ChevronLeftIcon />
                </IconButton>
                <IconButton
                  aria-label="Next photo"
                  onClick={() => go(1)}
                  sx={{ ...navSx, right: 8 }}
                >
                  <ChevronRightIcon />
                </IconButton>
              </>
            )}
          </Box>
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              columnGap: 2,
              px: 2,
              minHeight: tokens.touch.min,
              borderTop: "1px solid",
              borderColor: withAlpha(tokens.outlineVariant, "hairline"),
            }}
          >
            {current.credit ? (
              <Link
                href={current.creditUrl}
                target="_blank"
                rel="noreferrer noopener"
                sx={{
                  display: "flex",
                  alignItems: "center",
                  minHeight: tokens.touch.min,
                  overflowWrap: "anywhere",
                }}
              >
                <Typography variant="body2" component="span">
                  Photo: {current.credit}
                </Typography>
              </Link>
            ) : (
              <span />
            )}
            {many && (
              <Typography
                variant="body2"
                sx={{ color: tokens.onSurfaceVariant }}
                data-testid="photo-viewer-position"
                aria-live="polite"
              >
                {(index ?? 0) + 1} of {photos.length}
              </Typography>
            )}
          </Box>
        </>
      )}
    </Dialog>
  );
}
