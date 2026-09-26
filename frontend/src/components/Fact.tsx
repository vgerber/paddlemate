import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { fonts, labelSx } from "@/lib/theme";

/** Overline label of a fact block; also the app's small metadata label. */
export const factLabelSx = {
  ...labelSx,
  fontSize: "0.625rem",
  letterSpacing: "0.1em",
  color: "text.disabled",
} as const;

/** The value line of a fact block. */
export const valueSx = {
  fontFamily: fonts.label,
  fontSize: "0.8125rem",
} as const;

/** One labelled value in a detail header: overline label, value beneath, and
 * an optional quieter second line. The app's way of stating a fact. */
export default function Fact({
  label,
  value,
  caption,
}: {
  label: string;
  value: ReactNode;
  caption?: string;
}) {
  return (
    <Box>
      <Typography sx={factLabelSx}>{label}</Typography>
      <Typography sx={valueSx} component="div">
        {value}
      </Typography>
      {caption && (
        <Typography
          sx={{ ...factLabelSx, textTransform: "none", letterSpacing: 0 }}
        >
          {caption}
        </Typography>
      )}
    </Box>
  );
}
