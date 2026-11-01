import Box from "@mui/material/Box";
import type { ReactNode } from "react";
import PanelHeader from "@/components/PanelHeader";
import { theme } from "@/lib/theme/theme";

const { tokens } = theme;

/** The frame of every wiki screen: a centred column on a desktop (`width`
 * wide, the list takes the page), edge to edge on a phone. The panel header opens it, as on every other screen, and
 * on a desktop it sits in a card with the body beneath. */
export default function WikiPage({
  title,
  subtitle,
  onBack,
  actions,
  width = 880,
  headerOnPhoneOnly = false,
  children,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  actions?: ReactNode;
  /** Widest the column grows on a desktop. */
  width?: number;
  /** The screen draws its own title on a desktop (the wiki list does, beside
   * the tree), so the header shows on a phone only. */
  headerOnPhoneOnly?: boolean;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        maxWidth: width,
        mx: "auto",
        px: { xs: 0, md: 2 },
        py: { xs: 0, md: 2 },
      }}
    >
      <Box
        sx={{
          display: headerOnPhoneOnly ? { xs: "block", md: "none" } : undefined,
          borderRadius: { md: `${tokens.radii.md}px` },
          overflow: { md: "hidden" },
          mb: { md: 1 },
        }}
      >
        <PanelHeader
          title={title}
          subtitle={subtitle}
          onBack={onBack}
          focusOnOpen="lost"
          actionButton={actions}
        />
      </Box>
      {children}
    </Box>
  );
}
