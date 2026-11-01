import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import { Fragment, type ReactNode } from "react";
import ChipRow from "@/components/ChipRow";
import FilterChip from "@/components/search/FilterChip";
import { ChevronRightIcon } from "@/lib/icons";
import { focusRingSx } from "@/lib/theme/focusRing";
import { theme } from "@/lib/theme/theme";

const { tokens } = theme;

/** One step of a trail. The step without `onClick` is where the reader is. */
export interface Crumb {
  label: string;
  onClick?: () => void;
}

/** A trail of steps, each a way back. On a desktop it reads as a trail with
 * chevrons; with `chips` (a phone) it is a row of chips, the current step
 * filled. */
export default function Breadcrumb({
  crumbs,
  chips,
  lead,
}: {
  crumbs: Crumb[];
  /** Draw the steps as chips rather than a trail. */
  chips?: boolean;
  /** Chips that lead the row, before the steps (chips only). */
  lead?: ReactNode;
}) {
  if (chips) {
    return (
      <Box component="nav" aria-label="Breadcrumb">
        <ChipRow>
          {lead}
          {crumbs.map((step) => (
            <FilterChip
              key={step.label}
              label={step.label}
              set={!step.onClick}
              onClick={step.onClick}
            />
          ))}
        </ChipRow>
      </Box>
    );
  }
  return (
    <Box component="nav" aria-label="Breadcrumb">
      <Box
        component="ol"
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          listStyle: "none",
          m: 0,
          p: 0,
          // The first crumb's text starts where the content below starts.
          ml: -0.75,
        }}
      >
        {crumbs.map((step, i) => (
          <Fragment key={step.label}>
            {i > 0 && (
              <Box
                component="li"
                aria-hidden="true"
                sx={{ display: "flex", color: tokens.onSurfaceVariant }}
              >
                <ChevronRightIcon sx={{ fontSize: 16 }} />
              </Box>
            )}
            <Box component="li" sx={{ display: "flex" }}>
              {step.onClick ? (
                <ButtonBase
                  onClick={step.onClick}
                  sx={{
                    ...crumbSx,
                    color: "text.secondary",
                    "&:hover": { color: tokens.primary },
                  }}
                >
                  {step.label}
                </ButtonBase>
              ) : (
                <Box
                  component="span"
                  aria-current="page"
                  sx={{ ...crumbSx, color: "text.primary" }}
                >
                  {step.label}
                </Box>
              )}
            </Box>
          </Fragment>
        ))}
      </Box>
    </Box>
  );
}

const crumbSx = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: tokens.touch.min,
  px: 0.75,
  borderRadius: `${tokens.radii.sm}px`,
  fontSize: "0.875rem",
  fontWeight: 600,
  ...focusRingSx(-2),
} as const;
