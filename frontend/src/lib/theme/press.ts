import { tokens } from "./tokenVars";

const { motion } = tokens;

// Press feedback: a currentColor overlay moves by opacity (hover only where
// hover exists), release is slower than press, and buttons, chips and cards
// scale a hair while held. Reduced motion keeps the overlay and drops the
// scale. Filled controls use stronger steps.
export const PRESS_SCALE = 0.985;
export const easeOut = motion.easeOut;
export const slowTo = (props: string[]) =>
  props.map((p) => `${p} ${motion.fast}ms ${easeOut}`).join(", ");
export const COLOUR_PROPS = [
  "background-color",
  "border-color",
  "box-shadow",
  "color",
  "outline-color",
];

export function overlay(hover: number, press: number) {
  return {
    "&::before": {
      content: '""',
      position: "absolute",
      inset: 0,
      borderRadius: "inherit",
      backgroundColor: "currentColor",
      opacity: 0,
      pointerEvents: "none",
      transition: `opacity ${motion.fast}ms ${easeOut}`,
    },
    "@media (hover: hover)": { "&:hover::before": { opacity: hover } },
    "&:active::before": {
      opacity: press,
      transition: `opacity ${motion.instant}ms ${easeOut}`,
    },
    "&.Mui-disabled::before": { display: "none" },
  } as const;
}

export const scaleOnPress = {
  transition: slowTo(["transform", ...COLOUR_PROPS]),
  "&:active": {
    transform: `scale(${PRESS_SCALE})`,
    transition: `transform ${motion.instant}ms ${easeOut}`,
  },
  'html[data-motion="reduced"] &:active': { transform: "none" },
  "&.Mui-disabled": { transition: "none", transform: "none" },
} as const;
