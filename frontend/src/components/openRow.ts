import { alphas, theme } from "@/lib/theme";

const { tokens } = theme;

/** The open row of a list: a teal wash and a 3px bar at the left edge, on top
 * of the row card's own shadow unless the list owns the ground (`flat`). One
 * look for trip, proposal, settings and log rows. */
export function openRowSx(selected = false, flat = false) {
  if (!selected) return {};
  return {
    bgcolor: `${tokens.primary}${alphas.wash}`,
    boxShadow: flat
      ? `inset 3px 0 0 ${tokens.primary}`
      : `inset 3px 0 0 ${tokens.primary}, ${tokens.elevation.e1}`,
  };
}
