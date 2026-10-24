import { matchRow, pushRow, type RowKey, rowKey } from "./keys";

const CARD = "section[data-testid^='canvas-card-']";
const ROW = ".MuiListItemButton-root";
const BACK = "[data-panel-back]";
/** How long to wait for the screen to rebuild after a click. */
const WAIT_MS = 800;

function poll(done: () => boolean) {
  const end = performance.now() + WAIT_MS;
  const step = () => {
    if (!done() && performance.now() < end) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function lost() {
  const a = document.activeElement;
  return !a || a === document.body || !a.isConnected;
}

/** Keyboard users who open a row land on the new card's Back button; Back
 * (button, Escape) puts them on the row that opened it. Installed once by the
 * canvas host. Returns the cleanup. */
export function installFocusReturn(): () => void {
  let stack: RowKey[] = [];
  let byKeyboard = false;

  const onKey = (e: KeyboardEvent) => {
    byKeyboard = e.key === "Enter" || e.key === " ";
  };
  const onPointer = () => {
    byKeyboard = false;
  };

  const onClick = (e: MouseEvent) => {
    const t = e.target as Element | null;
    if (!t?.closest) return;
    const back = t.closest(BACK);
    if (back?.closest(CARD)) {
      const want = stack[stack.length - 1];
      if (!want) return;
      // A row that is not on screen (the Back went from a section to its
      // river) stays remembered for the next Back.
      poll(() => {
        const rows = [
          ...document.querySelectorAll<HTMLElement>(`${CARD} ${ROW}`),
        ].map((el) => ({ el, key: rowKey(el) }));
        const hit = matchRow(rows, want);
        if (!hit) return false;
        hit.el.focus();
        stack = stack.filter((k) => k !== want);
        return true;
      });
      return;
    }
    const row = t.closest<HTMLElement>(ROW);
    if (!row?.closest(CARD)) return;
    stack = pushRow(stack, rowKey(row));
    if (!byKeyboard) return;
    const before = new Set(document.querySelectorAll(BACK));
    poll(() => {
      const now = [...document.querySelectorAll<HTMLElement>(BACK)];
      const fresh = now.filter((b) => !before.has(b));
      const target = fresh[0] ?? (lost() ? now[now.length - 1] : undefined);
      target?.focus();
      return Boolean(target);
    });
  };

  document.addEventListener("keydown", onKey, true);
  document.addEventListener("pointerdown", onPointer, true);
  document.addEventListener("click", onClick, true);
  return () => {
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("pointerdown", onPointer, true);
    document.removeEventListener("click", onClick, true);
  };
}
