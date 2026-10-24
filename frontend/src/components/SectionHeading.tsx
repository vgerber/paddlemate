import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { fonts, theme } from "@/lib/theme";

const { tokens } = theme;

/** In-screen section heading: 13/600/18, secondary colour. */
export const sectionHeadingSx = {
  fontFamily: fonts.body,
  fontWeight: 600,
  fontSize: "0.8125rem",
  lineHeight: "18px",
  letterSpacing: 0,
  color: "text.secondary",
} as const;

/** Title of a card: 15/600/20. */
export const cardTitleSx = {
  fontFamily: fonts.body,
  fontWeight: 600,
  fontSize: "0.9375rem",
  lineHeight: "20px",
  letterSpacing: 0,
} as const;

export default function SectionHeading({
  children,
  action,
  id,
  component = "h2",
  first = false,
}: {
  children: ReactNode;
  action?: ReactNode;
  id?: string;
  component?: "h2" | "h3";
  first?: boolean;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 1,
        mt: first ? 0 : "24px",
        mb: "8px",
        minHeight: action ? tokens.touch.min : undefined,
      }}
    >
      <Typography
        id={id}
        component={component}
        sx={{ ...sectionHeadingSx, m: 0, minWidth: 0 }}
      >
        {children}
      </Typography>
      {action}
    </Box>
  );
}
