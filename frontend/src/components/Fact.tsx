import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { fonts, labelSx } from "@/lib/theme";

/** Label of a fact block; also the app's small metadata label. */
export const factLabelSx = {
  ...labelSx,
  fontWeight: 500,
  color: "text.secondary",
} as const;

/** The value line of a fact block. */
export const factValueSx = {
  fontFamily: fonts.body,
  fontSize: "1rem",
  lineHeight: "22px",
  fontWeight: 600,
} as const;

/** One labelled value in a detail header: label, value beneath, and an
 * optional quieter second line. The app's way of stating a fact. */
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
      <Typography data-testid="fact-label" sx={factLabelSx}>
        {label}
      </Typography>
      <Typography sx={factValueSx} component="div">
        {value}
      </Typography>
      {caption && (
        <Typography
          sx={{ ...factLabelSx, fontWeight: 400, fontSize: "0.8125rem" }}
        >
          {caption}
        </Typography>
      )}
    </Box>
  );
}
