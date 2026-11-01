import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { openRowSx } from "@/components/canvas/flatRow";
import QueryStates from "@/components/states/QueryStates";
import TreeView, {
  TREE_BASE_PAD,
  TREE_CHEVRON,
} from "@/components/tree/TreeView";
import { useBrandModels, useMaterialTree } from "@/lib/hooks/useMaterials";
import { MaterialIcon } from "@/lib/icons";
import {
  type MaterialWikiSearch,
  toMaterialFilters,
} from "@/lib/materials/search";
import {
  pathOf,
  type TreePath,
  type TreeRow,
  treeFilters,
  treeRows,
} from "@/lib/materials/tree";
import { focusRingSx } from "@/lib/theme/focusRing";
import { sectionHeadingSx, theme } from "@/lib/theme/theme";

const { tokens } = theme;

const BASE_PAD = TREE_BASE_PAD;
const CHEVRON = TREE_CHEVRON;

function RowContent({ row }: { row: TreeRow }) {
  const leaf = row.kind === "model";
  return (
    <>
      <Typography
        component="span"
        sx={{
          flex: 1,
          minWidth: 0,
          fontSize: leaf ? "0.875rem" : "0.9375rem",
          fontWeight: row.level === 1 || row.selected ? 600 : 500,
          overflowWrap: "anywhere",
        }}
      >
        {row.label}
      </Typography>
      {row.count != null && (
        <Typography
          component="span"
          sx={{
            fontSize: "0.8125rem",
            fontVariantNumeric: "tabular-nums",
            color: row.selected ? "inherit" : "text.secondary",
            flexShrink: 0,
          }}
        >
          {row.count}
        </Typography>
      )}
    </>
  );
}

/** The category tree of the wiki: category, discipline, brand, and the
 * models of the brand picked. A real ARIA tree, because the levels nest and a
 * screen reader user wants to know where they are in them: one tab stop, the
 * arrow keys walk it, Right opens, Left closes or climbs, Home and End jump,
 * a letter jumps to the next row starting with it. Choosing a row sets the
 * search, so the URL carries the path. */
export default function MaterialTree({
  search,
  onSelect,
  onOpen,
  total,
}: {
  search: MaterialWikiSearch;
  onSelect: (path: TreePath) => void;
  onOpen: (id: number) => void;
  /** Models matching the other filters, for the "All" row. */
  total?: number;
}) {
  const query = useMaterialTree(treeFilters(search));
  const path = pathOf(search);
  const brandOpen = path.category && path.discipline && path.brand;
  const models = useBrandModels(toMaterialFilters(search), Boolean(brandOpen));
  const [toggled, setToggled] = useState<Map<string, boolean>>(new Map());

  const rows = treeRows(query.data, search, toggled, models.data);

  const setOpen = (id: string, open: boolean) =>
    setToggled((prev) => new Map(prev).set(id, open));

  const activate = (row: TreeRow) => {
    if (row.kind === "model") {
      if (row.modelId != null) onOpen(row.modelId);
      return;
    }
    if (row.selected) {
      setOpen(row.id, !row.expanded);
      return;
    }
    setToggled((prev) => {
      const next = new Map(prev);
      next.delete(row.id);
      return next;
    });
    onSelect(row.path);
  };

  return (
    <Box component="nav" aria-label="Browse the wiki">
      <Typography
        id="wiki-tree-label"
        sx={{
          ...sectionHeadingSx,
          color: tokens.onSurfaceVariant,
          px: 1,
          pb: 0.5,
        }}
      >
        Browse
      </Typography>
      <Box
        component="button"
        type="button"
        data-testid="tree-all"
        aria-current={path.category ? undefined : "true"}
        onClick={() => onSelect({})}
        sx={{
          ...allSx,
          color: path.category ? "text.primary" : tokens.primary,
          bgcolor: "transparent",
          ...openRowSx(!path.category, true),
        }}
      >
        <MaterialIcon sx={{ fontSize: CHEVRON }} />
        <Typography
          component="span"
          sx={{ flex: 1, fontSize: "0.9375rem", fontWeight: 600 }}
        >
          All gear
        </Typography>
        {total != null && (
          <Typography
            component="span"
            sx={{ fontSize: "0.8125rem", fontVariantNumeric: "tabular-nums" }}
          >
            {total}
          </Typography>
        )}
      </Box>
      <QueryStates
        query={query}
        // An empty tree is the list's to explain; the tree just stays bare.
        count={Math.max(rows.length, 1)}
        errorFallback="Could not load the categories."
        empty={{ icon: <MaterialIcon />, title: "No categories match that." }}
        py={2}
      >
        <TreeView
          rows={rows}
          labelledBy="wiki-tree-label"
          rowTestId={(row) => `tree-${row.kind}`}
          isLeaf={(row) => row.kind === "model"}
          onActivate={activate}
          onToggle={setOpen}
          renderRow={(row) => <RowContent row={row} />}
        />
      </QueryStates>
    </Box>
  );
}

const allSx = {
  display: "flex",
  alignItems: "center",
  gap: 1,
  width: "100%",
  minHeight: tokens.touch.min,
  boxSizing: "border-box",
  pl: `${BASE_PAD}px`,
  pr: 1,
  border: 0,
  borderRadius: `${tokens.radii.row}px`,
  cursor: "pointer",
  textAlign: "left",
  font: "inherit",
  "&:hover": { bgcolor: tokens.surfaceLow },
  ...focusRingSx(-2),
} as const;
