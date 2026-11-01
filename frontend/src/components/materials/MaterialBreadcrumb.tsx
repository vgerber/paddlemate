import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import { Fragment, type ReactNode } from "react";
import ChipRow from "@/components/ChipRow";
import FilterChip from "@/components/search/FilterChip";
import { ChevronRightIcon } from "@/lib/icons";
import type { MaterialWikiSearch } from "@/lib/materials/materials";
import { type Crumb, crumbs, type TreePath } from "@/lib/materials/tree";
import { theme } from "@/lib/theme/theme";

const { tokens } = theme;

/** The path the tree stands on, each step a way back to it. On a desktop it
 * starts at the Tools page and reads as a trail; on a phone it is a row of
 * chips under the search, shown only once the list is narrowed. */
export default function MaterialBreadcrumb({
  search,
  chips,
  onSelect,
  onRoot,
  onTools,
  children,
}: {
  search: MaterialWikiSearch;
  /** Draw the steps as chips (phone) rather than a trail. */
  chips: boolean;
  onSelect: (path: TreePath) => void;
  /** The wiki itself, before any step. */
  onRoot: () => void;
  onTools: () => void;
  /** Chips that lead the phone's row, before the steps. */
  children?: ReactNode;
}) {
  const steps: Crumb[] = crumbs(search);
  if (chips) {
    return (
      <Box component="nav" aria-label="Breadcrumb">
        <ChipRow>
          {children}
          {steps.map((step, i) => (
            <FilterChip
              key={step.label}
              label={step.label}
              set={i === steps.length - 1}
              onClick={
                i === steps.length - 1 ? undefined : () => onSelect(step.patch)
              }
            />
          ))}
        </ChipRow>
      </Box>
    );
  }
  const trail: { label: string; go?: () => void }[] = [
    { label: "Tools", go: onTools },
    { label: "Material wiki", go: steps.length ? onRoot : undefined },
    ...steps.map((step, i) => ({
      label: step.label,
      go: i === steps.length - 1 ? undefined : () => onSelect(step.patch),
    })),
  ];
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
          // The first crumb's text starts where the cards below start.
          ml: -0.75,
        }}
      >
        {trail.map((step, i) => (
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
              {step.go ? (
                <ButtonBase
                  onClick={step.go}
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
  "&.Mui-focusVisible": {
    outline: `2px solid ${tokens.primary}`,
    outlineOffset: -2,
  },
} as const;
