import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import type { GaugeMapState } from "@/lib/api";
import { CloseIcon } from "@/lib/icons";
import { theme } from "@/lib/theme";
import type { GaugeStateMeta } from "./gaugeStates";

const { tokens } = theme;

interface GaugeLegendProps {
  states: GaugeStateMeta[];
  counts: Record<GaugeMapState, number>;
  hidden: Set<GaugeMapState>;
  onToggle: (state: GaugeMapState) => void;
  /** On a phone the legend folds to a chip so it does not cover the map. */
  phone: boolean;
  expanded: boolean;
  onExpand: (open: boolean) => void;
}

/** Legend + per-state filter (bottom-left, mirrors LabelModeToggle). */
export default function GaugeLegend({
  states,
  counts,
  hidden,
  onToggle,
  phone,
  expanded,
  onExpand,
}: GaugeLegendProps) {
  return (
    <Box
      data-testid="gauge-legend"
      sx={{
        position: "absolute",
        bottom: 14,
        left: 10,
        zIndex: 10,
        width: expanded ? 250 : "auto",
        maxWidth: "calc(100% - 20px)",
        bgcolor: tokens.surface,
        borderRadius: `${tokens.radii.md}px`,
        boxShadow: tokens.elevation.e2,
        overflow: "hidden",
        display: "grid",
        gap: "10px",
        p: expanded ? "12px 14px" : 0,
      }}
    >
      {phone && !expanded ? (
        <ButtonBase
          onClick={() => onExpand(true)}
          aria-expanded={false}
          sx={{
            gap: 1,
            px: 1.5,
            minHeight: tokens.touch.min,
            fontSize: "0.875rem",
            fontWeight: 600,
          }}
        >
          Gauges
          <Box sx={{ display: "flex", gap: 0.5 }}>
            {states.map((s) => (
              <Box
                key={s.key}
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  bgcolor: s.color,
                }}
              />
            ))}
          </Box>
        </ButtonBase>
      ) : (
        <>
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Typography sx={{ flex: 1, fontSize: "0.875rem", fontWeight: 700 }}>
              Gauges
            </Typography>
            {phone && (
              <IconButton
                aria-label="Fold the legend"
                aria-expanded
                onClick={() => onExpand(false)}
                sx={{
                  m: -1.5,
                  width: tokens.touch.min,
                  height: tokens.touch.min,
                }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
          {states.map((s) => {
            const off = hidden.has(s.key);
            return (
              <ButtonBase
                key={s.key}
                onClick={() => onToggle(s.key)}
                title={`Click to ${off ? "show" : "hide"}`}
                sx={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 1,
                  width: "100%",
                  minHeight: tokens.touch.min,
                  textAlign: "left",
                  opacity: off ? 0.45 : 1,
                }}
              >
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    bgcolor: s.color,
                    flexShrink: 0,
                    mt: "5px",
                  }}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
                    <Typography
                      sx={{
                        flex: 1,
                        fontSize: "0.875rem",
                        lineHeight: "20px",
                        fontWeight: 600,
                      }}
                    >
                      {s.label}
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: "0.8125rem",
                        fontWeight: 600,
                        color: tokens.onSurfaceVariant,
                      }}
                    >
                      {counts[s.key].toLocaleString()}
                    </Typography>
                  </Box>
                  <Typography
                    sx={{
                      fontSize: "0.8125rem",
                      lineHeight: "18px",
                      color: tokens.onSurfaceVariant,
                    }}
                  >
                    {s.help}
                  </Typography>
                </Box>
              </ButtonBase>
            );
          })}
        </>
      )}
    </Box>
  );
}
