import Box from "@mui/material/Box";
import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { ChevronRightIcon, ExpandIcon } from "@/lib/icons";
import { withAlpha } from "@/lib/theme/alpha";
import { focusRingSx } from "@/lib/theme/focusRing";
import { theme } from "@/lib/theme/theme";
import { type TreeNode, treeKey } from "./treeKeys";

const { tokens } = theme;

/** Left pad of level 1, and what each level adds, in px. */
export const TREE_BASE_PAD = 8;
export const TREE_LEVEL_STEP = 16;
/** Size of the chevron slot, which leaves line up with. */
export const TREE_CHEVRON = 16;

/** Positions of each row among the rows of its level under one parent. */
function placements(rows: readonly TreeNode[]) {
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

/** A WAI-ARIA tree over the visible rows: one tab stop, the arrow keys walk
 * it, Right opens, Left closes or climbs, Home and End jump, a letter jumps
 * to the next row starting with it. The caller owns what opening and
 * choosing a row do; the rows' content comes from `renderRow`. */
export default function TreeView<T extends TreeNode>({
  rows,
  labelledBy,
  renderRow,
  onActivate,
  onToggle,
  rowTestId,
  isLeaf,
}: {
  rows: readonly T[];
  /** Id of the element that names the tree. */
  labelledBy: string;
  /** The row's content, after the chevron. */
  renderRow: (row: T) => ReactNode;
  /** Enter, Space or a click on the row. */
  onActivate: (row: T) => void;
  onToggle: (id: string, open: boolean) => void;
  rowTestId?: (row: T) => string;
  /** A row that cannot be selected, only opened (no aria-selected). */
  isLeaf?: (row: T) => boolean;
}) {
  const [activeId, setActiveId] = useState("");
  const els = useRef(new Map<string, HTMLElement>());
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

  const onKeyDown = (event: KeyboardEvent<HTMLElement>, row: T) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const move = treeKey(rows, row.id, event.key);
    if (!move) return;
    event.preventDefault();
    if (move.type === "focus") {
      setActiveId(move.id);
      els.current.get(move.id)?.focus();
    } else if (move.type === "toggle") {
      onToggle(move.id, move.open);
    } else {
      onActivate(row);
    }
  };

  return (
    <Box role="tree" aria-labelledby={labelledBy}>
      {rows.map((row, i) => (
        <Box
          key={row.id}
          ref={(el: HTMLElement | null) => {
            if (el) els.current.set(row.id, el);
            else els.current.delete(row.id);
          }}
          role="treeitem"
          tabIndex={row.id === tabId ? 0 : -1}
          aria-level={row.level}
          aria-setsize={places[i].size}
          aria-posinset={places[i].pos}
          aria-expanded={row.expandable ? row.expanded : undefined}
          aria-selected={isLeaf?.(row) ? undefined : row.selected}
          data-testid={rowTestId?.(row)}
          data-node={row.id}
          onClick={() => onActivate(row)}
          onKeyDown={(event) => onKeyDown(event, row)}
          onFocus={() => setActiveId(row.id)}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            minHeight: tokens.touch.min,
            boxSizing: "border-box",
            pl: `${TREE_BASE_PAD + (row.level - 1) * TREE_LEVEL_STEP}px`,
            pr: 1,
            borderRadius: `${tokens.radii.row}px`,
            cursor: "pointer",
            color: row.selected ? tokens.primary : "text.primary",
            bgcolor: row.selected
              ? withAlpha(tokens.primary, "wash")
              : undefined,
            "&:hover": {
              bgcolor: row.selected
                ? withAlpha(tokens.primary, "hover")
                : tokens.surfaceLow,
            },
            ...focusRingSx(-2),
          }}
        >
          <Box
            component="span"
            aria-hidden="true"
            onClick={(event: MouseEvent) => {
              if (!row.expandable) return;
              event.stopPropagation();
              onToggle(row.id, !row.expanded);
            }}
            sx={{
              flexShrink: 0,
              width: TREE_CHEVRON,
              height: TREE_CHEVRON,
              display: "inline-flex",
              color: tokens.onSurfaceVariant,
            }}
          >
            {row.expandable &&
              (row.expanded ? (
                <ExpandIcon sx={{ fontSize: TREE_CHEVRON }} />
              ) : (
                <ChevronRightIcon sx={{ fontSize: TREE_CHEVRON }} />
              ))}
          </Box>
          {renderRow(row)}
        </Box>
      ))}
    </Box>
  );
}
