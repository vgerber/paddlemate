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
  LEAD_MS,
  prefersReducedMotion,
  REDUCED_FADE_MS,
} from "@/lib/motion";

const SHIFT_PX = 16;
// Choreography moment 6: the leaving step fades out in 140 ms, the arriving
// one fades in over 60-280 ms; the two overlap.
const LEAVE_MS = REDUCED_FADE_MS;
const ENTER_DELAY_MS = LEAD_MS;
const ENTER_MS = durations.fast + LEAD_MS;

interface Ghost {
  step: number;
  node: ReactNode;
  dir: 1 | -1;
  fade: boolean;
}

/** The leaving step is the same keyed element that was showing, kept mounted
 * until its fade ends, so a step's mount effects and maps run once.
 *
 * Swaps wizard steps with a direction-aware slide: forward leaves to the
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
      step: shown,
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

  // Whether the last input was the keyboard: a touch user is not handed a
  // soft keyboard by a step change, a keyboard user is not left on <body>.
  const byKeyboard = useRef(false);
  useEffect(() => {
    const set = (v: boolean) => () => {
      byKeyboard.current = v;
    };
    const down = set(true);
    const point = set(false);
    window.addEventListener("keydown", down, true);
    window.addEventListener("pointerdown", point, true);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("pointerdown", point, true);
    };
  }, []);

  // A new step takes focus to its first control, so the next Tab continues
  // inside it. Not on the first render.
  const first = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs per step change only
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!byKeyboard.current) return;
    enterRef.current
      ?.querySelector<HTMLElement>(
        "input:not([disabled]):not([type=hidden]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex='-1'])",
      )
      ?.focus({ preventScroll: true });
  }, [step]);

  useLayoutEffect(() => {
    const m = motion.current;
    if (!m || !ghost) return;
    motion.current = null;
    const reduced = prefersReducedMotion();
    const plain = reduced || m.fade;
    const shift = plain ? 0 : SHIFT_PX * m.dir;
    const move = (x: number) => (plain ? "none" : `translateX(${x}px)`);
    const leaveMs = reduced ? LEAVE_MS : m.fade ? durations.fast : LEAVE_MS;
    // A step swapped back mid-fade reuses its element: drop the old fade.
    for (const a of enterRef.current?.getAnimations() ?? []) a.cancel();
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
          key={ghost.step}
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
      <Box key={step} ref={enterRef} data-step-enter>
        {children}
      </Box>
    </Box>
  );
}
