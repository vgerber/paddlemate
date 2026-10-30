import { theme } from "@/lib/theme/theme";

const { tokens } = theme;

export const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

export const DISC = 36;
export const BAND_INSET = 4;
export const GRABBER = 16;
/** What the 44px button reaches beyond a 16px strip, per side. */
export const OVERHANG = (tokens.touch.min - GRABBER) / 2;
export const MARK = 5;
export const MARK_GAP = 3;
// What the handle button adds below the week: its height less the overhang it
// shares with its neighbours (see the button's margins).
export const HANDLE_BLOCK = tokens.touch.min + 8 - OVERHANG + (6 - OVERHANG);

// Ink behind the month, over the list.
export const MONTH_SCRIM = 18;
export const MONTH_SCRIM_DARK = 50;

// Seven columns, the first disc's left edge on the 28 line and the last
// one's right edge on the right line: the disc centre of column one sits at
// line + DISC / 2, which solves to this padding (a percentage is of the
// strip's width). Capped so seven 44px hit cells still fit at 320.
export const STRIP_PAD = `min(calc((${tokens.phone.line + DISC / 2}px - 100% / 14) * 7 / 6), calc(50% - ${(7 * tokens.touch.min) / 2}px))`;
