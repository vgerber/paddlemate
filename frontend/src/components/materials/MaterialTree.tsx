import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import {
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import QueryStates from "@/components/states/QueryStates";
import { useBrandModels, useMaterialTree } from "@/lib/hooks/useMaterials";
import { ChevronRightIcon, ExpandIcon, MaterialIcon } from "@/lib/icons";
import {
  type MaterialWikiSearch,
  toMaterialFilters,
} from "@/lib/materials/materials";
import {
  pathOf,
  type TreePath,
  type TreeRow,
  treeFilters,
  treeKey,
  treeRows,
} from "@/lib/materials/tree";
import { withAlpha } from "@/lib/theme/alpha";
import { labelSx, theme } from "@/lib/theme/theme";

const { tokens } = theme;

/** Left pad of level 1, and what each level adds, in px. */
const BASE_PAD = 8;
const LEVEL_STEP = 16;
const CHEVRON = 16;

function Row({
  row,
  tabbable,
  siblings,
  onActivate,
  onToggle,
  onKeyDown,
  onFocus,
  setRef,
}: {
  row: TreeRow;
  tabbable: boolean;
  siblings: { size: number; pos: number };
  onActivate: () => void;
  onToggle: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  onFocus: () => void;
  setRef: (el: HTMLElement | null) => void;
}) {
  const leaf = row.kind === "model";
  return (
    <Box
      ref={setRef}
      role="treeitem"
      tabIndex={tabbable ? 0 : -1}
      aria-level={row.level}
      aria-setsize={siblings.size}
      aria-posinset={siblings.pos}
      aria-expanded={row.expandable ? row.expanded : undefined}
      aria-selected={leaf ? undefined : row.selected}
      data-testid={`tree-${row.kind}`}
      data-node={row.id}
      onClick={onActivate}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        minHeight: leaf ? 40 : tokens.touch.min,
        boxSizing: "border-box",
        pl: `${BASE_PAD + (row.level - 1) * LEVEL_STEP}px`,
        pr: 1,
        borderRadius: `${tokens.radii.row}px`,
        cursor: "pointer",
        color: row.selected ? tokens.primary : "text.primary",
        bgcolor: row.selected ? withAlpha(tokens.primary, "wash") : undefined,
        "&:hover": {
          bgcolor: row.selected
            ? withAlpha(tokens.primary, "hover")
            : tokens.surfaceLow,
        },
        "&:focus-visible": {
          outline: `2px solid ${tokens.primary}`,
          outlineOffset: -2,
        },
      }}
    >
      <Box
        component="span"
        aria-hidden="true"
        onClick={(event: MouseEvent) => {
          if (!row.expandable) return;
          event.stopPropagation();
          onToggle();
        }}
        sx={{
          flexShrink: 0,
          width: CHEVRON,
          height: CHEVRON,
          display: "inline-flex",
          color: tokens.onSurfaceVariant,
        }}
      >
        {row.expandable &&
          (row.expanded ? (
            <ExpandIcon sx={{ fontSize: CHEVRON }} />
          ) : (
            <ChevronRightIcon sx={{ fontSize: CHEVRON }} />
          ))}
      </Box>
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
      {(row.count != null || row.sizes) && (
        <Typography
          component="span"
          sx={{
            fontSize: "0.8125rem",
            fontVariantNumeric: "tabular-nums",
            color: row.selected ? "inherit" : "text.secondary",
            flexShrink: 0,
          }}
        >
          {row.count ?? row.sizes}
        </Typography>
      )}
    </Box>
  );
}

/** Positions of each row among the rows of its level under one parent. */
function placements(rows: TreeRow[]) {
  const counts = new Map<string | undefined, number>();
  for (const row of rows) {
    counts.set(row.parentId, (counts.get(row.parentId) ?? 0) + 1);
  }
  const seen = new Map<string | undefined, number>();
  return rows.map((row) => {
    const pos = (seen.get(row.parentId) ?? 0) + 1;
    seen.set(row.parentId, pos);
    return { size: counts.get(row.parentId) ?? 1, pos };
  });
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
  const [activeId, setActiveId] = useState<string>("");
  const els = useRef(new Map<string, HTMLElement>());

  const rows = treeRows(query.data, search, toggled, models.data);
  const places = placements(rows);
  const tabId =
    rows.find((r) => r.id === activeId)?.id ??
    rows.find((r) => r.selected)?.id ??
    rows[0]?.id;

  // The selection can sit below the fold of a long tree (a link, the back
  // button), so bring it into view whenever it changes.
  const selectedId = rows.find((r) => r.selected)?.id;
  useEffect(() => {
    if (selectedId && rows.length > 0) {
      els.current.get(selectedId)?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedId, rows.length]);

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

  const onKeyDown = (event: KeyboardEvent<HTMLElement>, row: TreeRow) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const move = treeKey(rows, row.id, event.key);
    if (!move) return;
    event.preventDefault();
    if (move.type === "focus") {
      setActiveId(move.id);
      els.current.get(move.id)?.focus();
    } else if (move.type === "toggle") {
      setOpen(move.id, move.open);
    } else {
      activate(row);
    }
  };

  return (
    <Box component="nav" aria-label="Browse the wiki">
      <Typography
        id="wiki-tree-label"
        sx={{
          ...labelSx,
          color: "text.secondary",
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
          bgcolor: path.category
            ? "transparent"
            : withAlpha(tokens.primary, "wash"),
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
        count={rows.length}
        errorFallback="Could not load the categories."
        empty={{ icon: <MaterialIcon />, title: "No categories match that." }}
        py={2}
      >
        <Box role="tree" aria-labelledby="wiki-tree-label">
          {rows.map((row, i) => (
            <Row
              key={row.id}
              row={row}
              tabbable={row.id === tabId}
              siblings={places[i]}
              onActivate={() => activate(row)}
              onToggle={() => setOpen(row.id, !row.expanded)}
              onKeyDown={(event) => onKeyDown(event, row)}
              onFocus={() => setActiveId(row.id)}
              setRef={(el) => {
                if (el) els.current.set(row.id, el);
                else els.current.delete(row.id);
              }}
            />
          ))}
        </Box>
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
  "&:focus-visible": {
    outline: `2px solid ${tokens.primary}`,
    outlineOffset: -2,
  },
} as const;
