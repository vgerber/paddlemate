import Box from "@mui/material/Box";
import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  css,
  durations,
  prefersReducedMotion,
  REDUCED_FADE_MS,
} from "@/lib/motion";

const SHIFT_PX = 16;
// Choreography moment 6: the leaving step fades out in 140 ms, the arriving
// one fades in over 60-280 ms; the two overlap.
const LEAVE_MS = REDUCED_FADE_MS;
const ENTER_DELAY_MS = 60;
const ENTER_MS = 220;

interface Ghost {
  node: ReactNode;
  dir: 1 | -1;
  fade: boolean;
}

/** Swaps wizard steps with a direction-aware slide: forward leaves to the
 * left and arrives from the right, back is mirrored. Only the step content
 * moves, never the footer. Under reduced motion the steps cross-fade in
 * place. `fadeTo` names a step (the saved state) entered by a plain
 * cross-fade of `durations.fast`. */
export default function StepSlide({
  step,
  fadeTo,
  children,
}: {
  step: number;
  fadeTo?: number;
  children: ReactNode;
}) {
  const last = useRef({ step, node: children });
  const [shown, setShown] = useState(step);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const enterRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const motion = useRef<Ghost | null>(null);

  if (shown !== step) {
    const next: Ghost = {
      node: last.current.node,
      dir: step > shown ? 1 : -1,
      fade: step === fadeTo,
    };
    setShown(step);
    setGhost(next);
    motion.current = next;
  }

  useEffect(() => {
    last.current = { step, node: children };
  });

  useLayoutEffect(() => {
    const m = motion.current;
    if (!m || !ghost) return;
    motion.current = null;
    const reduced = prefersReducedMotion();
    const plain = reduced || m.fade;
    const shift = plain ? 0 : SHIFT_PX * m.dir;
    const move = (x: number) => (plain ? "none" : `translateX(${x}px)`);
    const leaveMs = reduced ? LEAVE_MS : m.fade ? durations.fast : LEAVE_MS;
    const enter = enterRef.current?.animate(
      [
        { opacity: 0, transform: move(shift) },
        { opacity: 1, transform: "none" },
      ],
      reduced
        ? { duration: LEAVE_MS, easing: css.easeOut, fill: "backwards" }
        : m.fade
          ? { duration: durations.fast, easing: css.easeOut, fill: "backwards" }
          : {
              delay: ENTER_DELAY_MS,
              duration: ENTER_MS,
              easing: css.easeOut,
              fill: "backwards",
            },
    );
    const leave = ghostRef.current?.animate(
      [
        { opacity: 1, transform: "none" },
        { opacity: 0, transform: move(-shift) },
      ],
      { duration: leaveMs, easing: css.easeIn, fill: "forwards" },
    );
    const done = () => setGhost(null);
    if (leave) leave.onfinish = done;
    else done();
    return () => {
      enter?.cancel();
    };
  }, [ghost]);

  return (
    <Box sx={{ position: "relative", minWidth: 0 }}>
      {ghost && (
        <Box
          ref={ghostRef}
          inert
          aria-hidden
          data-step-ghost
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            pointerEvents: "none",
          }}
        >
          {ghost.node}
        </Box>
      )}
      <Box ref={enterRef} data-step-enter>
        {children}
      </Box>
    </Box>
  );
}
