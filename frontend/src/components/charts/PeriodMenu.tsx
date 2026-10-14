import CheckIcon from "@mui/icons-material/Check";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ButtonBase from "@mui/material/ButtonBase";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { useState } from "react";
import type { TimeRange } from "@/components/charts/water/types";
import { alphas, theme } from "@/lib/theme";

const { tokens } = theme;

const LABELS: Record<TimeRange, string> = {
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

const MENU_WIDTH = 200;
const MENU_GAP = 4;

/** The chart's period: one quiet text button that opens a four-item menu
 * upward. */
export default function PeriodMenu({
  value,
  onChange,
}: {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = anchor != null;
  const Chevron = open ? ExpandLessIcon : ExpandMoreIcon;
  return (
    <>
      <ButtonBase
        aria-label="Chart period"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{
          alignSelf: "flex-start",
          minHeight: tokens.touch.min,
          // The box sits 12px out so the label starts on the text line.
          mx: "-12px",
          px: "12px",
          gap: 0.5,
          borderRadius: `${tokens.radii.sm}px`,
          fontSize: "0.875rem",
          fontWeight: 600,
          color: open ? tokens.primary : tokens.onSurfaceVariant,
          bgcolor: open ? `${tokens.primary}${alphas.wash}` : "transparent",
        }}
      >
        {LABELS[value]}
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
        {OFFERED.map((p) => {
          const on = p === value;
          return (
            <MenuItem
              key={p}
              selected={on}
              onClick={() => {
                onChange(p);
                setAnchor(null);
              }}
              sx={{
                // MUI's own sm+ min-height wins over a plain one.
                "&&": { minHeight: tokens.touch.min },
                justifyContent: "space-between",
                fontSize: "0.875rem",
                fontWeight: on ? 600 : 400,
                color: on ? tokens.primary : "inherit",
              }}
            >
              {LABELS[p]}
              {on && <CheckIcon sx={{ fontSize: 18 }} />}
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}
