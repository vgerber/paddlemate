import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import type { ReactNode } from "react";
import { theme } from "@/lib/theme";

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
  bottomOffset?: number;
  anchor?: "top" | "bottom";
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

/** Map layer controls: a floating key card with what section labels say,
 * feature-name visibility, and the satellite base layer. */
export default function LabelModeToggle({
  labelMode,
  onChange,
  satellite,
  onSatelliteChange,
  featureNames,
  onFeatureNamesChange,
  bottomOffset = 0,
  anchor = "bottom",
}: LabelModeToggleProps) {
  const edge = { xs: 10, md: 24 };
  return (
    <Box
      data-testid="map-layer-toggle"
      sx={{
        position: "absolute",
        ...(anchor === "top"
          ? { top: { xs: 14, md: 24 } }
          : {
              bottom: {
                xs: 14 + bottomOffset,
                md: 24 + bottomOffset,
              },
            }),
        left: edge,
        zIndex: 10,
        display: "grid",
        gap: 1,
        p: "10px",
        borderRadius: `${tokens.radii.md}px`,
        boxShadow: tokens.elevation.e2,
        bgcolor: tokens.surface,
      }}
    >
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
    </Box>
  );
}
