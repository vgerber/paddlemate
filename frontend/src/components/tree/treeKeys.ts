/** What a tree needs to know about a visible row to walk it. */
export interface TreeNode {
  id: string;
  label: string;
  /** 1 for the outermost level. */
  level: number;
  parentId?: string;
  expandable: boolean;
  expanded: boolean;
  selected: boolean;
}

/** What a keypress does to the focused row. `focus` moves the roving focus,
 * `toggle` opens or closes the row, `activate` selects it. */
export type TreeMove =
  | { type: "focus"; id: string }
  | { type: "toggle"; id: string; open: boolean }
  | { type: "activate"; id: string }
  | null;

/** The WAI-ARIA tree keys over the visible rows: arrows, Home, End, Enter and
 * Space, and a typed letter jumping to the next row that starts with it. */
export function treeKey(
  rows: readonly TreeNode[],
  activeId: string,
  key: string,
): TreeMove {
  const at = rows.findIndex((row) => row.id === activeId);
  const row = rows[at];
  if (!row) return null;
  switch (key) {
    case "ArrowDown":
      return at < rows.length - 1
        ? { type: "focus", id: rows[at + 1].id }
        : null;
    case "ArrowUp":
      return at > 0 ? { type: "focus", id: rows[at - 1].id } : null;
    case "Home":
      return { type: "focus", id: rows[0].id };
    case "End":
      return { type: "focus", id: rows[rows.length - 1].id };
    case "ArrowRight":
      if (row.expandable && !row.expanded) {
        return { type: "toggle", id: row.id, open: true };
      }
      if (row.expanded && rows[at + 1]?.parentId === row.id) {
        return { type: "focus", id: rows[at + 1].id };
      }
      return null;
    case "ArrowLeft":
      if (row.expanded) return { type: "toggle", id: row.id, open: false };
      return row.parentId ? { type: "focus", id: row.parentId } : null;
    case "Enter":
    case " ":
      return { type: "activate", id: row.id };
    default: {
      if (key.length !== 1) return null;
      const letter = key.toLowerCase();
      const order = [...rows.slice(at + 1), ...rows.slice(0, at)];
      const hit = order.find((r) => r.label.toLowerCase().startsWith(letter));
      return hit ? { type: "focus", id: hit.id } : null;
    }
  }
}
