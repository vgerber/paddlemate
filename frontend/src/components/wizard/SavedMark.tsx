import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useReducedMotion } from "@/lib/motion";
import { theme } from "@/lib/theme";

const { tokens } = theme;
const { motion } = tokens;

const RISE_PX = 8;
const CIRCLE_LEN = 151;
const CHECK_LEN = 30;

/** The saved state of a wizard: the circle draws, the check follows, the
 * title rises 8 px, then the hint. No loop. Reduced: drawn at once, a short
 * fade. */
export default function SavedMark({
  title,
  caption,
}: {
  title: string;
  caption?: string;
}) {
  const reduced = useReducedMotion();
  const draw = (
    name: string,
    delay: number,
    time: number,
    ease: string = motion.easeInOut,
  ) => (reduced ? "none" : `${name} ${time}ms ${ease} ${delay}ms backwards`);
  const rise = (delay: number) =>
    reduced
      ? `pm-saved-fade ${motion.reducedFade}ms ${motion.easeOut} backwards`
      : `pm-saved-rise ${motion.fast}ms ${motion.easeOut} ${delay}ms backwards`;

  return (
    <Box
      data-testid="saved-mark"
      sx={{
        display: "grid",
        justifyItems: "center",
        gap: 1.5,
        textAlign: "center",
        py: 8,
        px: 2,
        "@keyframes pm-saved-circle": {
          from: { strokeDashoffset: CIRCLE_LEN },
          to: { strokeDashoffset: 0 },
        },
        "@keyframes pm-saved-check": {
          from: { strokeDashoffset: CHECK_LEN },
          to: { strokeDashoffset: 0 },
        },
        "@keyframes pm-saved-rise": {
          from: { opacity: 0, transform: `translateY(${RISE_PX}px)` },
          to: { opacity: 1, transform: "none" },
        },
        "@keyframes pm-saved-fade": {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
      }}
    >
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden>
        <circle
          data-saved="circle"
          cx="28"
          cy="28"
          r="24"
          stroke={tokens.success}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={CIRCLE_LEN}
          style={{ animation: draw("pm-saved-circle", 100, 320) }}
        />
        <path
          data-saved="check"
          d="M18 29 L25 36 L38 21"
          stroke={tokens.success}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={CHECK_LEN}
          style={{ animation: draw("pm-saved-check", 220, 180) }}
        />
      </svg>
      <Typography variant="h6" data-saved="title" sx={{ animation: rise(260) }}>
        {title}
      </Typography>
      {caption && (
        <Typography
          variant="body2"
          color="textSecondary"
          data-saved="caption"
          sx={{ animation: rise(340) }}
        >
          {caption}
        </Typography>
      )}
    </Box>
  );
}
