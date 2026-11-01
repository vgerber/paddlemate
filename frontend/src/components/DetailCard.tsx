import Box from "@mui/material/Box";
import type { SxProps, Theme } from "@mui/material/styles";
import type { ReactNode } from "react";
import { phoneCardSx } from "@/components/phone/phoneGrid";
import SectionHeading from "@/components/SectionHeading";
import { theme } from "@/lib/theme/theme";

const { tokens } = theme;

/** A block of a detail page: a white card on the grey ground, with its
 * heading above it when it has one. Cards stack 8px apart. */
export default function DetailCard({
  heading,
  first,
  sx,
  children,
}: {
  heading?: string;
  /** The card opens its block: its heading drops the space above. */
  first?: boolean;
  /** Overrides for the card, such as its vertical padding. */
  sx?: SxProps<Theme>;
  children: ReactNode;
}) {
  return (
    <Box>
      {heading && (
        <Box sx={{ mx: { xs: `${tokens.phone.edge}px`, md: 0 } }}>
          <SectionHeading inset first={first}>
            {heading}
          </SectionHeading>
        </Box>
      )}
      <Box
        sx={[
          phoneCardSx,
          { px: `${tokens.phone.inner}px`, py: 1, mb: 1 },
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
      >
        {children}
      </Box>
    </Box>
  );
}
