/** What an Escape press landed on, reduced to the facts that decide whether
 * it means Back. */
export interface EscapeContext {
  key: string;
  defaultPrevented: boolean;
  /** The event target sits inside the card's own DOM, not a portal. */
  inside: boolean;
  /** A text field (input, textarea, editable) holds the focus. */
  inField: boolean;
  /** The field has content: Escape belongs to the field then. */
  fieldFilled: boolean;
  /** The target controls an open popup (combobox, menu button). */
  popupOpen: boolean;
}

/** Whether Escape in a card acts as its Back or Close. Menus, dialogs and
 * popovers handle Escape themselves first (they sit in portals, so `inside`
 * is false or the event is already handled). */
export function escapeGoesBack(c: EscapeContext): boolean {
  if (c.key !== "Escape" || c.defaultPrevented || !c.inside) return false;
  if (c.popupOpen) return false;
  return !(c.inField && c.fieldFilled);
}

export function escapeContext(e: {
  key: string;
  defaultPrevented: boolean;
  currentTarget: EventTarget & Element;
  target: EventTarget;
}): EscapeContext {
  const t = e.target as HTMLElement;
  const inside = e.currentTarget.contains(t);
  const editable = t.isContentEditable;
  const input =
    t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;
  return {
    key: e.key,
    defaultPrevented: e.defaultPrevented,
    inside,
    inField: input || editable,
    fieldFilled: input ? t.value !== "" : (t.textContent ?? "") !== "",
    popupOpen: t.getAttribute("aria-expanded") === "true",
  };
}

/** How to find a row again after the list around it was rebuilt. */
export interface RowKey {
  testId: string | null;
  text: string;
}

export function rowKey(el: HTMLElement): RowKey {
  return {
    testId: el.getAttribute("data-testid"),
    text: (el.textContent ?? "").trim().slice(0, 80),
  };
}

/** The candidate that is the remembered row: same test id (when it had one)
 * and the same text. */
export function matchRow<T extends { key: RowKey }>(
  candidates: T[],
  want: RowKey,
): T | undefined {
  return candidates.find(
    (c) => c.key.testId === want.testId && c.key.text === want.text,
  );
}

/** Rows opened so far, innermost last; Back pops one. */
export function pushRow(stack: RowKey[], key: RowKey): RowKey[] {
  const last = stack[stack.length - 1];
  if (last && last.testId === key.testId && last.text === key.text) {
    return stack;
  }
  return [...stack.slice(-9), key];
}
