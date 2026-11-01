import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import NativeSelect from "@mui/material/NativeSelect";
import Typography from "@mui/material/Typography";
import { Link } from "@tanstack/react-router";
import { Fragment, useEffect, useRef, useState } from "react";
import { phoneCardSx } from "@/components/phone/phoneGrid";
import type { Material } from "@/lib/api";
import { useMaterial } from "@/lib/hooks/useMaterials";
import { AddIcon, CloseIcon } from "@/lib/icons";
import {
  buildComparison,
  COMPARE_GROUP_LABELS,
  type CompareRow,
  MAX_COMPARE,
} from "@/lib/materials/compare";
import { materialTitle, modelSizes } from "@/lib/materials/facts";
import { useUnits } from "@/lib/prefs/units";
import { withAlpha } from "@/lib/theme/alpha";
import { focusRing, focusRingSx } from "@/lib/theme/focusRing";
import { css } from "@/lib/theme/motion";
import {
  cardTitleSx,
  labelSx,
  sectionHeadingSx,
  theme,
} from "@/lib/theme/theme";

const { tokens } = theme;

/** Up to this many entries share the width equally; more scroll sideways. */
const FIT_COLUMNS = 4;
const WIDE_COLUMN = 148;
const LABEL_COLUMN = 168;

const ruleSx = `1px solid ${withAlpha(tokens.outlineVariant, "hairline")}`;

/** One row: the label, then a cell per entry. From md the label is a column
 * of its own; on a phone it sits on its own line above the values. */
function rowSx(columns: string) {
  return {
    display: "grid",
    gridTemplateColumns: { xs: columns, md: `${LABEL_COLUMN}px ${columns}` },
    columnGap: { xs: 1, md: 2 },
    px: { xs: 1.5, md: 2 },
  } as const;
}

const labelCellSx = {
  gridColumn: { xs: "1 / -1", md: "auto" },
  position: "sticky",
  left: 0,
  justifySelf: "start",
  bgcolor: tokens.surface,
  pt: 1.25,
  pb: { xs: 0.25, md: 1.25 },
  pr: 1,
} as const;

function EntrySize({
  material,
  onResize,
}: {
  material: Material;
  onResize: (from: number, to: number) => void;
}) {
  // The list does not carry the other sizes; the entry does.
  const detail = useMaterial(material.id);
  const sizes = modelSizes(detail.data ?? material);
  if (sizes.length === 0) {
    return material.size ? (
      <Typography
        variant="body2"
        sx={{ fontWeight: 600, minHeight: 44, py: 1.25 }}
      >
        {material.size}
      </Typography>
    ) : null;
  }
  return (
    <NativeSelect
      disableUnderline
      value={material.id}
      onChange={(event) => onResize(material.id, Number(event.target.value))}
      inputProps={{ "aria-label": `Size of ${materialTitle(material)}` }}
      sx={{
        minHeight: tokens.touch.min,
        fontSize: "0.875rem",
        fontWeight: 600,
        maxWidth: "100%",
        "& .MuiNativeSelect-select:focus-visible": focusRing(-2),
      }}
    >
      {sizes.map(({ id, size }) => (
        <option key={id} value={id}>
          {size ?? "-"}
        </option>
      ))}
    </NativeSelect>
  );
}

function EntryHead({
  material,
  onRemove,
  onResize,
}: {
  material: Material;
  onRemove: (id: number) => void;
  onResize: (from: number, to: number) => void;
}) {
  const name = [material.model, material.variant].filter(Boolean).join(" ");
  return (
    <Box
      role="columnheader"
      sx={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        pb: 0.5,
        pr: { md: 5 },
        pt: { md: 1 },
      }}
    >
      <IconButton
        onClick={() => onRemove(material.id)}
        aria-label={`Remove ${materialTitle(material)} from the comparison`}
        sx={{
          order: -1,
          alignSelf: "flex-end",
          width: tokens.touch.min,
          height: tokens.touch.min,
          mr: -1.5,
          mb: -1.5,
          flexShrink: 0,
          // From md the column is wide enough to carry it beside the name.
          position: { md: "absolute" },
          top: { md: 0 },
          right: { md: 0 },
          m: { md: 0 },
        }}
      >
        <CloseIcon fontSize="small" />
      </IconButton>
      <Link
        to="/materials/$materialId"
        params={{ materialId: String(material.id) }}
        search={{ edit: false }}
        style={{
          textDecoration: "none",
          minWidth: 0,
          minHeight: tokens.touch.min,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <Typography
          sx={{ ...labelSx, overflowWrap: "anywhere", lineHeight: "16px" }}
        >
          {material.brand}
        </Typography>
        <Typography
          sx={{
            ...cardTitleSx,
            color: "text.primary",
            overflowWrap: "anywhere",
          }}
        >
          {name}
        </Typography>
      </Link>
      <EntrySize material={material} onResize={onResize} />
    </Box>
  );
}

/** A zero-based bar under a number: its length is the value's share of the
 * largest. The transform moves, never the width; reduced motion drops it. */
function Bar({ ratio }: { ratio: number }) {
  return (
    <Box
      aria-hidden
      sx={{
        mt: 0.5,
        height: 4,
        borderRadius: tokens.radii.pill,
        bgcolor: tokens.surfaceHigh,
        overflow: "hidden",
      }}
    >
      <Box
        data-testid="compare-bar-fill"
        sx={{
          height: "100%",
          bgcolor: tokens.primary,
          transformOrigin: "left",
          transform: `scaleX(${ratio})`,
          transition: `transform ${css.base} ${css.easeOut}`,
        }}
      />
    </Box>
  );
}

function CompareRowView({
  row,
  columns,
}: {
  row: CompareRow;
  columns: string;
}) {
  return (
    <Box
      role="row"
      data-testid="compare-row"
      data-row={row.key}
      sx={{ ...rowSx(columns), borderBottom: ruleSx }}
    >
      <Box role="rowheader" sx={labelCellSx}>
        <Typography variant="body2" color="textSecondary">
          {row.label}
        </Typography>
      </Box>
      {row.cells.map((cell, index) => (
        <Box
          key={index}
          role="cell"
          sx={{ minWidth: 0, pt: { xs: 0, md: 1.25 }, pb: 1.25 }}
        >
          <Typography
            sx={{
              fontSize: "0.9375rem",
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
              overflowWrap: "anywhere",
            }}
          >
            {cell ?? "-"}
          </Typography>
          {row.bars?.[index] != null && <Bar ratio={row.bars[index]} />}
        </Box>
      ))}
    </Box>
  );
}

/** The picked entries in a card of their own: what all of them share, the way
 * to add more, and a note when kinds are mixed. */
function Summary({
  alike,
  count,
  mixed,
  onAdd,
}: {
  alike: string[];
  count: number;
  mixed: boolean;
  onAdd: () => void;
}) {
  return (
    <Box sx={{ ...phoneCardSx, mb: 1, overflow: "hidden" }}>
      {alike.length > 0 && (
        <Box
          data-testid="compare-alike"
          sx={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 0.75,
            px: 1.5,
            py: 1.25,
            borderBottom: ruleSx,
          }}
        >
          <Typography sx={{ ...labelSx, mr: 0.5 }}>
            Alike in all {count}
          </Typography>
          {alike.map((chip) => (
            <Chip key={chip} label={chip} />
          ))}
        </Box>
      )}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 0.5,
        }}
      >
        <Button
          startIcon={<AddIcon />}
          disabled={count >= MAX_COMPARE}
          onClick={onAdd}
          sx={{ minHeight: tokens.touch.min }}
        >
          Add to comparison
        </Button>
        <Typography
          variant="body2"
          color="textSecondary"
          sx={{ pr: 1.5, fontWeight: 600 }}
        >
          {count} of {MAX_COMPARE}
        </Typography>
      </Box>
      {mixed && (
        <Typography
          data-testid="compare-mixed-note"
          variant="body2"
          color="textSecondary"
          sx={{ px: 1.5, pb: 1.25 }}
        >
          Different kinds are picked, so only rows shared by two or more entries
          are compared.
        </Typography>
      )}
    </Box>
  );
}

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
  onAdd,
}: {
  materials: Material[];
  onRemove: (id: number) => void;
  /** Swap an entry for another size of its model, keeping its place. */
  onResize: (from: number, to: number) => void;
  onAdd: () => void;
}) {
  const [units] = useUnits();
  const { alike, rows, mixed } = buildComparison(materials, units);
  const wide = materials.length > FIT_COLUMNS;
  const { ref, scrolls } = useScrollsSideways(wide);
  const columns = wide
    ? `repeat(${materials.length}, ${WIDE_COLUMN}px)`
    : `repeat(${materials.length}, minmax(0, 1fr))`;
  const hasBars = rows.some((row) => row.bars);

  let lastGroup: string | undefined;
  return (
    <>
      <Summary
        alike={alike}
        count={materials.length}
        mixed={mixed}
        onAdd={onAdd}
      />
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
          maxHeight: wide ? "calc(100dvh - 160px)" : undefined,
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
              <EntryHead
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
                <CompareRowView row={row} columns={columns} />
              </Fragment>
            );
          })}
        </Box>
      </Box>
      {hasBars && (
        <Typography variant="body2" color="textSecondary" sx={{ px: 2, pt: 1 }}>
          Bars start at zero and appear where entries differ by 5% or more.
        </Typography>
      )}
    </>
  );
}
