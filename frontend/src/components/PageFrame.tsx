import Box from "@mui/material/Box";
import type { ReactNode } from "react";
import PanelHeader from "@/components/PanelHeader";
import { theme } from "@/lib/theme/theme";

const { tokens } = theme;

/** The card a panel header sits in on a desktop: rounded, with the body
 * beneath. A phone shows it edge to edge. */
export function HeaderCard({
  children,
  display,
  testId,
}: {
  children: ReactNode;
  display?: { xs: string; md: string };
  testId?: string;
}) {
  return (
    <Box
      data-testid={testId}
      sx={{
        display,
        borderRadius: { md: `${tokens.radii.md}px` },
        overflow: { md: "hidden" },
        mb: { md: 1 },
      }}
    >
      {children}
    </Box>
  );
}

/** The frame of a page that is not on the map canvas: a centred column on a
 * desktop (`width` wide), edge to edge on a phone. With a `title` the panel
 * header opens it, as on every other screen, and on a desktop it sits in a
 * card with the body beneath. `roomy` pads the column on a phone too, for a
 * page of plain text. */
export default function PageFrame({
  title,
  subtitle,
  onBack,
  actions,
  width = 880,
  headerOnPhoneOnly = false,
  roomy = false,
  children,
}: {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  actions?: ReactNode;
  /** Widest the column grows on a desktop. */
  width?: number;
  /** The screen draws its own title on a desktop (the wiki list does, beside
   * the tree), so the header shows on a phone only. */
  headerOnPhoneOnly?: boolean;
  /** Padding on a phone as well as a desktop. */
  roomy?: boolean;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        maxWidth: width,
        mx: "auto",
        px: roomy ? { xs: 1.5, md: 2 } : { xs: 0, md: 2 },
        py: roomy ? { xs: 2, md: 3 } : { xs: 0, md: 2 },
      }}
    >
      {title != null && (
        <HeaderCard
          display={headerOnPhoneOnly ? { xs: "block", md: "none" } : undefined}
        >
          <PanelHeader
            title={title}
            subtitle={subtitle}
            onBack={onBack}
            focusOnOpen="lost"
            actionButton={actions}
          />
        </HeaderCard>
      )}
      {children}
    </Box>
  );
}
