import { createSvgIcon } from "@mui/material/utils";

/** Line glyphs for the plan: 2px stroke on a 24 grid, drawn in the current
 * colour, so they sit with the outlined Material icons around them. */
const line = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const PLANE =
  "M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z";

/** A tent: two poles crossing at the ridge, the flap, the ground line. */
export const TentIcon = createSvgIcon(
  <path {...line} d="M3.5 21 14 3M20.5 21 10 3M15.5 21 12 15l-3.5 6M2 21h20" />,
  "Tent",
);

/** A plane coming down: the same glyph as leaving, tipped over. */
export const ArrivalIcon = createSvgIcon(
  <path {...line} d={PLANE} transform="rotate(90 12 12)" />,
  "Arrival",
);

/** A plane taking off. */
export const DepartureIcon = createSvgIcon(
  <path {...line} d={PLANE} />,
  "Departure",
);
