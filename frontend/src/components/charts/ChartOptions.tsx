import CheckIcon from "@mui/icons-material/Check";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Popover, { type PopoverProps } from "@mui/material/Popover";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import { labelSx, theme } from "@/lib/theme";

const { tokens } = theme;

const rowSx = {
  minHeight: tokens.touch.row,
  px: 2,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 2,
  width: "100%",
  textAlign: "left",
  fontSize: "0.9375rem",
} as const;

export interface ChartOptionsProps {
  open: boolean;
  onClose: () => void;
  anchor: Pick<
    PopoverProps,
    "anchorEl" | "anchorReference" | "anchorPosition" | "anchorOrigin"
  > & { transformOrigin: PopoverProps["transformOrigin"] };
  /** Which reading to chart, when the gauge has more than one. */
  types: { type: string; label: string }[];
  type: string | null;
  onType: (type: string) => void;
  /** The threshold lines; absent when the chart has none to draw. */
  thresholds?: { on: boolean; onChange: (on: boolean) => void };
  /** Closes a picked gauge's chart. */
  onDismiss?: () => void;
}

/** Whether the options have anything to offer; without, the button hides. */
export function hasChartOptions(
  p: Pick<ChartOptionsProps, "types" | "thresholds" | "onDismiss">,
): boolean {
  return p.types.length > 1 || p.thresholds != null || p.onDismiss != null;
}

/** The chart's options in a 300px popover over the map. It holds only what
 * the chart can do: which reading, the threshold lines, closing a picked
 * gauge. Esc or a tap outside closes it. */
export default function ChartOptions({
  open,
  onClose,
  anchor,
  types,
  type,
  onType,
  thresholds,
  onDismiss,
}: ChartOptionsProps) {
  const { transformOrigin, ...place } = anchor;
  return (
    <Popover
      open={open}
      onClose={onClose}
      {...place}
      transformOrigin={transformOrigin}
      slotProps={{
        paper: {
          role: "dialog",
          "aria-label": "Chart options",
          sx: {
            width: 300,
            py: 1,
            borderRadius: `${tokens.radii.md}px`,
            boxShadow: tokens.elevation.e2,
          },
        },
      }}
    >
      {types.length > 1 && (
        <Box role="group" aria-label="Reading">
          <Typography sx={{ ...labelSx, px: 2, pt: 0.5 }}>Reading</Typography>
          {types.map((t) => (
            <ButtonBase
              key={t.type}
              aria-pressed={t.type === type}
              onClick={() => onType(t.type)}
              sx={rowSx}
            >
              {t.label}
              {t.type === type && (
                <CheckIcon sx={{ color: tokens.primary }} fontSize="small" />
              )}
            </ButtonBase>
          ))}
        </Box>
      )}
      {thresholds && (
        <Box sx={rowSx}>
          <Typography component="span" sx={{ fontSize: "inherit" }} id="opt-th">
            Thresholds
          </Typography>
          <Switch
            checked={thresholds.on}
            onChange={(_, on) => thresholds.onChange(on)}
            slotProps={{ input: { "aria-labelledby": "opt-th" } }}
          />
        </Box>
      )}
      {onDismiss && (
        <ButtonBase
          onClick={() => {
            onClose();
            onDismiss();
          }}
          sx={rowSx}
        >
          Close gauge chart
        </ButtonBase>
      )}
    </Popover>
  );
}
