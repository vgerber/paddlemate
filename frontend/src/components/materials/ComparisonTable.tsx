import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { Fragment, useEffect, useRef, useState } from "react";
import { phoneCardSx } from "@/components/phone/phoneGrid";
import type { Material } from "@/lib/api";
import { buildComparison, COMPARE_GROUP_LABELS } from "@/lib/materials/compare";
import { useUnits } from "@/lib/prefs/units";
import { focusRingSx } from "@/lib/theme/focusRing";
import { sectionHeadingSx, theme } from "@/lib/theme/theme";
import ComparisonHead from "./ComparisonHead";
import ComparisonRow from "./ComparisonRow";
import ComparisonSummary from "./ComparisonSummary";
import {
  FIT_COLUMNS,
  rowSx,
  ruleSx,
  TABLE_CLEARANCE,
  WIDE_COLUMN,
} from "./comparisonLayout";

const { tokens } = theme;

/** Whether the element is wider than its box, kept current on resize. */
function useScrollsSideways(active: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrolls, setScrolls] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) {
      setScrolls(false);
      return;
    }
    const measure = () => setScrolls(el.scrollWidth > el.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [active]);
  return { ref, scrolls };
}

/** Entries side by side. Values every entry shares become chips; the table
 * keeps only the rows that tell them apart, and a row two entries state at
 * least. Up to four entries share the width, more scroll under a sticky head. */
export default function ComparisonTable({
  materials,
  onRemove,
  onResize,
}: {
  materials: Material[];
  onRemove: (id: number) => void;
  /** Swap an entry for another size of its model, keeping its place. */
  onResize: (from: number, to: number) => void;
}) {
  const [units] = useUnits();
  const { alike, rows, mixed } = buildComparison(materials, units);
  const wide = materials.length > FIT_COLUMNS;
  const { ref, scrolls } = useScrollsSideways(wide);
  const columns = wide
    ? `repeat(${materials.length}, ${WIDE_COLUMN}px)`
    : `repeat(${materials.length}, minmax(0, 1fr))`;

  let lastGroup: string | undefined;
  return (
    <>
      <ComparisonSummary alike={alike} count={materials.length} mixed={mixed} />
      {wide && scrolls && (
        <Typography
          data-testid="compare-scroll-hint"
          variant="body2"
          color="textSecondary"
          sx={{ px: 2, pb: 0.75 }}
        >
          {materials.length} entries are wider than the screen: scroll sideways
          to see them all.
        </Typography>
      )}
      <Box
        ref={ref}
        role="region"
        aria-label="Comparison table"
        tabIndex={wide ? 0 : undefined}
        sx={{
          ...phoneCardSx,
          overflow: wide ? "auto" : "hidden",
          maxHeight: wide ? `calc(100dvh - ${TABLE_CLEARANCE}px)` : undefined,
          ...focusRingSx(),
        }}
      >
        <Box
          role="table"
          aria-label="Entries side by side"
          sx={{ width: wide ? "max-content" : "100%", minWidth: "100%" }}
        >
          <Box
            role="row"
            sx={{
              ...rowSx(columns),
              position: "sticky",
              top: 0,
              zIndex: 2,
              bgcolor: tokens.surface,
              borderBottom: ruleSx,
              pt: 0.5,
            }}
          >
            <Box
              role="presentation"
              sx={{ display: { xs: "none", md: "block" } }}
            />
            {materials.map((material) => (
              <ComparisonHead
                key={material.id}
                material={material}
                onRemove={onRemove}
                onResize={onResize}
              />
            ))}
          </Box>
          {rows.length === 0 && (
            <Typography
              variant="body2"
              color="textSecondary"
              sx={{ px: 2, py: 2 }}
            >
              Nothing tells these entries apart.
            </Typography>
          )}
          {rows.map((row) => {
            const heading = row.group !== lastGroup;
            lastGroup = row.group;
            return (
              <Fragment key={row.key}>
                {heading && (
                  <Box
                    role="row"
                    sx={{
                      bgcolor: tokens.surfaceLow,
                      px: { xs: 1.5, md: 2 },
                      py: 0.75,
                    }}
                  >
                    <Typography
                      role="rowheader"
                      sx={{
                        ...sectionHeadingSx,
                        color: tokens.onSurfaceVariant,
                        position: "sticky",
                        left: 0,
                        width: "fit-content",
                      }}
                    >
                      {COMPARE_GROUP_LABELS[row.group]}
                    </Typography>
                  </Box>
                )}
                <ComparisonRow row={row} columns={columns} />
              </Fragment>
            );
          })}
        </Box>
      </Box>
    </>
  );
}
