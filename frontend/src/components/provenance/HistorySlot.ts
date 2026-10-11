import { createContext } from "react";

/** The element a desktop history opens over: the whole detail panel, header
 * and tabs included. Without one the history renders in place. */
export const HistorySlot = createContext<HTMLElement | null>(null);
