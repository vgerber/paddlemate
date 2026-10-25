import ButtonBase from "@mui/material/ButtonBase";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { useState } from "react";
import RangeDialog from "@/components/charts/RangeDialog";
import type { CustomRange, TimeRange } from "@/components/charts/water/types";
import { withAlpha } from "@/lib/alpha";
import { chartRange } from "@/lib/format";
import { CollapseIcon, ConfirmIcon, ExpandIcon } from "@/lib/icons";
import { css, prefersReducedMotion, REDUCED_FADE_MS } from "@/lib/motion";
import { theme } from "@/lib/theme";

const { tokens } = theme;

export const PERIOD_LABELS: Record<TimeRange, string> = {
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "1m": "Last 30 days",
  "3m": "Last 3 months",
  "6m": "Last 6 months",
  "1y": "Last year",
};

/** What the menu offers; the phone card's other periods still read right
 * on the button. */
const OFFERED: TimeRange[] = ["24h", "7d", "1m", "1y"];

const CUSTOM_LABEL = "Custom range…";
const MENU_WIDTH = 200;
const MENU_GAP = 4;

/** What a chart's period control reads and changes: a preset, or a custom
 * range that overrides it until reset. */
export interface PeriodControl {
  value: TimeRange;
  custom: CustomRange | null;
  onChange: (range: TimeRange) => void;
  onCustom: (range: CustomRange | null) => void;
}

/** The period as the control and the chart's name say it. */
export function periodLabel(value: TimeRange, custom: CustomRange | null) {
  return custom ? chartRange(custom.from, custom.to) : PERIOD_LABELS[value];
}

const ROW_STAGGER_MS = 40;
const STAGGER_ROWS = 3;

/** An option row fades in and drops 4 px, a row after the one above (three
 * rows at most); reduced, they only cross-fade. */
function rowIn(index: number) {
  const reduced = prefersReducedMotion();
  const delay = reduced
    ? 0
    : ROW_STAGGER_MS * Math.min(index, STAGGER_ROWS - 1);
  const time = reduced ? `${REDUCED_FADE_MS}ms` : css.fast;
  return {
    animation: `pm-option-in ${time} ${css.easeOut} ${delay}ms backwards`,
    "@keyframes pm-option-in": {
      from: { opacity: 0, transform: reduced ? "none" : "translateY(-4px)" },
    },
  };
}

const quietButtonSx = {
  alignSelf: "flex-start",
  minHeight: tokens.touch.min,
  px: "12px",
  borderRadius: `${tokens.radii.sm}px`,
  fontSize: "0.875rem",
  fontWeight: 600,
  whiteSpace: "nowrap",
} as const;

/** The chart's period: one quiet text button that opens a menu upward, the
 * presets and a custom range. A custom range gets a Reset beside it. */
export default function PeriodMenu({
  value,
  custom,
  onChange,
  onCustom,
}: PeriodControl) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [dialog, setDialog] = useState(false);
  const open = anchor != null;
  const Chevron = open ? CollapseIcon : ExpandIcon;
  return (
    <>
      <ButtonBase
        aria-label={`${periodLabel(value, custom)}, chart period`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{
          ...quietButtonSx,
          // The box sits 12px out so the label starts on the text line.
          mx: "-12px",
          gap: 0.5,
          color: open ? tokens.primary : tokens.onSurfaceVariant,
          bgcolor: open ? withAlpha(tokens.primary, "wash") : "transparent",
          transition: `background-color ${css.fast} ${css.easeOut}, color ${css.fast} ${css.easeOut}`,
        }}
      >
        {periodLabel(value, custom)}
        <Chevron sx={{ fontSize: 16 }} />
      </ButtonBase>
      <Menu
        anchorEl={anchor}
        open={open}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "top", horizontal: "left" }}
        transformOrigin={{ vertical: "bottom", horizontal: "left" }}
        slotProps={{
          paper: { sx: { width: MENU_WIDTH, mt: `-${MENU_GAP}px` } },
        }}
      >
        {OFFERED.map((p, i) => {
          const on = p === value && !custom;
          return (
            <MenuItem
              key={p}
              selected={on}
              onClick={() => {
                onChange(p);
                setAnchor(null);
              }}
              sx={{
                ...rowIn(i),
                // MUI's own sm+ min-height wins over a plain one.
                "&&": { minHeight: tokens.touch.min },
                justifyContent: "space-between",
                fontSize: "0.875rem",
                fontWeight: on ? 600 : 400,
                color: on ? tokens.primary : "inherit",
              }}
            >
              {PERIOD_LABELS[p]}
              {on && <ConfirmIcon sx={{ fontSize: 18 }} />}
            </MenuItem>
          );
        })}
        <MenuItem
          selected={custom != null}
          onClick={() => {
            setAnchor(null);
            setDialog(true);
          }}
          sx={{
            ...rowIn(OFFERED.length),
            "&&": { minHeight: tokens.touch.min },
            fontSize: "0.875rem",
            fontWeight: custom ? 600 : 400,
            color: custom ? tokens.primary : "inherit",
          }}
        >
          {CUSTOM_LABEL}
        </MenuItem>
      </Menu>
      {custom && (
        <ButtonBase
          onClick={() => onCustom(null)}
          sx={{ ...quietButtonSx, color: tokens.primary }}
        >
          Reset
        </ButtonBase>
      )}
      {dialog && (
        <RangeDialog
          open
          current={custom}
          onCancel={() => setDialog(false)}
          onApply={(range) => {
            setDialog(false);
            onCustom(range);
          }}
        />
      )}
    </>
  );
}
