import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Paper, { type PaperProps } from "@mui/material/Paper";
import Popover from "@mui/material/Popover";
import { type ReactNode, useState } from "react";
import { alphas, theme } from "@/lib/theme";
import type { MapPadding } from "./Map";
import { BELOW_ZOOM, stackOffset } from "./MapCompass";

const { tokens } = theme;

interface LabelModeToggleProps {
  labelMode: "section" | "river";
  /** When omitted, the section/river label switch is hidden. */
  onChange?: (mode: "section" | "river") => void;
  satellite: boolean;
  onSatelliteChange: (v: boolean) => void;
  /** Whether feature name labels are shown on the map. When the change
   * handler is omitted, the toggle is hidden. */
  featureNames?: boolean;
  onFeatureNamesChange?: (v: boolean) => void;
  /** Free-area edges on a canvas screen; without it the key sits in the
   * map's own top-right corner stack. */
  inset?: MapPadding;
}

/** A recessed track holding cells; the set ones are white pills. */
function Track({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        display: "flex",
        gap: "2px",
        p: "2px",
        bgcolor: tokens.surfaceLow,
        border: `1px solid ${tokens.outlineVariant}`,
        borderRadius: `${tokens.radii.sm}px`,
      }}
    >
      {children}
    </Box>
  );
}

function Cell({
  active,
  title,
  onClick,
  flex,
  children,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  flex?: boolean;
  children: ReactNode;
}) {
  return (
    <ButtonBase
      onClick={onClick}
      title={title}
      aria-pressed={active}
      sx={{
        flex: flex ? 1 : "0 1 auto",
        px: 1.5,
        minHeight: tokens.touch.min,
        whiteSpace: "nowrap",
        fontSize: "0.8125rem",
        fontWeight: active ? 600 : 500,
        color: active ? tokens.onSurface : tokens.onSurfaceVariant,
        bgcolor: active ? tokens.surface : "transparent",
        boxShadow: active ? tokens.elevation.e1 : "none",
        borderRadius: `${tokens.radii.sm - 2}px`,
        "&:hover": { bgcolor: active ? tokens.surface : tokens.surfaceHighest },
      }}
    >
      {children}
    </ButtonBase>
  );
}

/** The layer choices: what section labels say, feature-name visibility and
 * the satellite base layer. */
function Choices({
  labelMode,
  onChange,
  satellite,
  onSatelliteChange,
  featureNames,
  onFeatureNamesChange,
}: Pick<
  LabelModeToggleProps,
  | "labelMode"
  | "onChange"
  | "satellite"
  | "onSatelliteChange"
  | "featureNames"
  | "onFeatureNamesChange"
>) {
  return (
    <>
      {(onChange || onFeatureNamesChange) && (
        <Track>
          {onChange && (
            <>
              <Cell
                flex
                active={labelMode === "section"}
                title="Label sections with their own name"
                onClick={() => onChange("section")}
              >
                Section
              </Cell>
              <Cell
                flex
                active={labelMode === "river"}
                title="Label sections with their river's name"
                onClick={() => onChange("river")}
              >
                River
              </Cell>
            </>
          )}
          {onFeatureNamesChange && (
            <Cell
              flex
              active={!!featureNames}
              title="Show names of rapids, put-ins and other features"
              onClick={() => onFeatureNamesChange(!featureNames)}
            >
              Features
            </Cell>
          )}
        </Track>
      )}
      <Track>
        <Cell
          flex
          active={satellite}
          title="Satellite base map"
          onClick={() => onSatelliteChange(!satellite)}
        >
          Satellite
        </Cell>
      </Track>
    </>
  );
}

/** The popover's surface, named for tests and for the toggle's design. */
function LayerPaper(props: PaperProps) {
  return <Paper data-testid="map-layer-toggle" {...props} />;
}

/** The layer choices are one key in the control stack, under the zoom group,
 * and open in a 272px popover to its left. */
function LayerKey(
  props: Parameters<typeof Choices>[0] & { inset?: MapPadding },
) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const { inset, ...choices } = props;
  const { top, right } = stackOffset(inset);
  const open = anchor != null;
  return (
    <>
      <ButtonBase
        data-testid="map-layer-button"
        aria-label="Map layers"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(e) => setAnchor(open ? null : e.currentTarget)}
        sx={{
          position: "absolute",
          zIndex: 2,
          top: top + BELOW_ZOOM,
          right,
          width: tokens.touch.min,
          height: tokens.touch.min,
          borderRadius: `${tokens.radii.sm}px`,
          bgcolor: open ? `${tokens.primary}${alphas.wash}` : tokens.surface,
          color: open ? tokens.primary : tokens.onSurface,
          boxShadow: open
            ? `${tokens.elevation.e2}, inset 0 0 0 2px ${tokens.primary}`
            : tokens.elevation.e2,
        }}
      >
        <LayersOutlinedIcon />
      </ButtonBase>
      <Popover
        open={open}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "top", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        // The popover sits 8px left of the key, level with its top.
        marginThreshold={8}
        disableScrollLock
        slots={{ paper: LayerPaper }}
        slotProps={{
          paper: {
            role: "dialog",
            "aria-label": "Map layers",
            sx: {
              width: 272,
              ml: -1,
              display: "grid",
              gap: 1,
              p: "10px",
              bgcolor: tokens.surface,
              borderRadius: `${tokens.radii.md}px`,
              boxShadow: tokens.elevation.e2,
            },
          },
        }}
      >
        <Choices {...choices} />
      </Popover>
    </>
  );
}

/** Map layer controls: one 44px key under the zoom group that opens what
 * section labels say, feature-name visibility and the satellite base layer. */
export default function LabelModeToggle(props: LabelModeToggleProps) {
  return <LayerKey {...props} />;
}
