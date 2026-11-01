import { withAlpha } from "@/lib/theme/alpha";
import { theme } from "@/lib/theme/theme";

const { tokens } = theme;

/** Up to this many entries share the width equally; more scroll sideways. */
export const FIT_COLUMNS = 4;

/** Width of an entry's column once the table scrolls sideways, px. */
export const WIDE_COLUMN = 148;

/** Width of the row-label column from md, px. */
export const LABEL_COLUMN = 168;

/** Height the page keeps for what sits above a scrolling table (app bar,
 * header, summary), px: the table is as tall as the window less this. */
export const TABLE_CLEARANCE = 160;

/** The dimmed rule between rows. */
export const ruleSx = `1px solid ${withAlpha(tokens.outlineVariant, "hairline")}`;

/** One row: the label, then a cell per entry. From md the label is a column
 * of its own; on a phone it sits on its own line above the values. */
export function rowSx(columns: string) {
  return {
    display: "grid",
    gridTemplateColumns: { xs: columns, md: `${LABEL_COLUMN}px ${columns}` },
    columnGap: { xs: 1, md: 2 },
    px: { xs: 1.5, md: 2 },
  } as const;
}

export const labelCellSx = {
  gridColumn: { xs: "1 / -1", md: "auto" },
  position: "sticky",
  left: 0,
  justifySelf: "start",
  bgcolor: tokens.surface,
  pt: 1.25,
  pb: { xs: 0.25, md: 1.25 },
  pr: 1,
} as const;
