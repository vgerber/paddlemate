import ButtonBase from "@mui/material/ButtonBase";
import Popover from "@mui/material/Popover";
import { useState } from "react";
import { Segment, SegmentTrack } from "@/components/canvas/SegmentedControl";
import { withAlpha } from "@/lib/alpha";
import { LayersIcon } from "@/lib/icons";
import { theme } from "@/lib/theme";
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
        <SegmentTrack bordered>
          {onChange && (
            <>
              <Segment
                fill
                active={labelMode === "section"}
                title="Label sections with their own name"
                onClick={() => onChange("section")}
              >
                Section
              </Segment>
              <Segment
                fill
                active={labelMode === "river"}
                title="Label sections with their river's name"
                onClick={() => onChange("river")}
              >
                River
              </Segment>
            </>
          )}
          {onFeatureNamesChange && (
            <Segment
              fill
              active={!!featureNames}
              title="Show names of rapids, put-ins and other features"
              onClick={() => onFeatureNamesChange(!featureNames)}
            >
              Features
            </Segment>
          )}
        </SegmentTrack>
      )}
      <SegmentTrack bordered>
        <Segment
          fill
          active={satellite}
          title="Satellite base map"
          onClick={() => onSatelliteChange(!satellite)}
        >
          Satellite
        </Segment>
      </SegmentTrack>
    </>
  );
}

// Spread in, so the slot props type takes the data attribute.
const PAPER_TEST_ID = { "data-testid": "map-layer-toggle" };

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
          bgcolor: open ? withAlpha(tokens.primary, "wash") : tokens.surface,
          color: open ? tokens.primary : tokens.onSurface,
          boxShadow: open
            ? `${tokens.elevation.e2}, inset 0 0 0 2px ${tokens.primary}`
            : tokens.elevation.e2,
        }}
      >
        <LayersIcon />
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
        // Props only: a replaced paper slot loses the popover paper's
        // absolute position, and the popover lands in the window's corner.
        slotProps={{
          paper: {
            ...PAPER_TEST_ID,
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
