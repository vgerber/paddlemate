import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { css, prefersReducedMotion, REDUCED_FADE_MS } from "@/lib/motion";
import { theme } from "@/lib/theme";
import { useNumberTransition } from "./useNumberTransition";

const { tokens } = theme;

const NUMBER_SHIFT = 4;

/** The reading's number in a fixed cell: a new value rises in while the old
 * one moves up and out (cross-fade only when reduced). Tabular figures keep
 * both the same width. */
export default function ReadingNumber({
  text,
  size,
  stale,
}: {
  text: string;
  size: number;
  stale: boolean;
}) {
  const { leaving, changes } = useNumberTransition(text);
  const reduced = prefersReducedMotion();
  const shift = reduced ? 0 : NUMBER_SHIFT;
  const time = reduced ? `${REDUCED_FADE_MS}ms` : css.fast;
  const base = {
    fontSize: size,
    lineHeight: 1,
    fontWeight: 600,
    fontVariantNumeric: "tabular-nums",
    color: stale ? tokens.onSurfaceVariant : tokens.onSurface,
    opacity: stale ? 0.6 : 1,
  } as const;
  return (
    <Box
      component="span"
      data-testid="reading-number"
      // The old value is a pseudo element, so it is never read as text.
      data-prev={leaving ?? undefined}
      sx={{
        display: "inline-block",
        position: "relative",
        "&[data-prev]::before": {
          ...base,
          position: "absolute",
          left: 0,
          top: 0,
          content: "attr(data-prev)",
          animation: `pm-number-out ${time} ${css.easeIn} forwards`,
        },
        "@keyframes pm-number-in": {
          from: { opacity: 0, transform: `translateY(${shift}px)` },
        },
        "@keyframes pm-number-out": {
          to: { opacity: 0, transform: `translateY(-${shift}px)` },
        },
      }}
    >
      <Typography
        component="span"
        key={changes}
        sx={{
          ...base,
          animation:
            changes > 0
              ? `pm-number-in ${time} ${css.easeOut} backwards`
              : "none",
        }}
      >
        {text}
      </Typography>
    </Box>
  );
}
