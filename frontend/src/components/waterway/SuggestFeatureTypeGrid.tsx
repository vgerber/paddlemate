import Box from "@mui/material/Box";
import FeatureTypeIcon from "@/components/FeatureTypeIcon";
import type { FeatureType } from "@/lib/api";
import { FEATURE_TYPES } from "@/lib/featureTypes";
import { humanize } from "@/lib/format";
import { labelSx, theme } from "@/lib/theme";

const { tokens } = theme;

/** "put_in" -> "Put-in", "take_out" -> "Take-out" (one spelling with the
 * wizard's other screens). */
function typeLabel(type: FeatureType): string {
  if (type === "put_in") return "Put-in";
  if (type === "take_out") return "Take-out";
  const text = humanize(type);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The feature type as a grid of icon tiles, one chosen (teal). A radio
 * group, so a keyboard and a screen reader get the same single choice. */
export default function SuggestFeatureTypeGrid({
  value,
  onChange,
  disabled,
}: {
  value: FeatureType;
  onChange: (type: FeatureType) => void;
  disabled?: boolean;
}) {
  return (
    <Box
      role="radiogroup"
      aria-label="Feature type"
      sx={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))",
        gap: 1,
      }}
    >
      {FEATURE_TYPES.map((type) => {
        const chosen = type === value;
        return (
          <Box
            key={type}
            component="button"
            type="button"
            role="radio"
            aria-checked={chosen}
            aria-label={typeLabel(type)}
            disabled={disabled}
            onClick={() => onChange(type)}
            sx={{
              ...labelSx,
              fontSize: "0.8125rem",
              minHeight: 64,
              minWidth: tokens.touch.min,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 0.5,
              px: 0.5,
              cursor: "pointer",
              border: "1px solid",
              borderRadius: `${tokens.radii.sm}px`,
              borderColor: chosen ? tokens.primary : tokens.outlineVariant,
              bgcolor: chosen ? tokens.primaryContainer : tokens.surface,
              color: chosen ? tokens.primary : tokens.onSurfaceVariant,
              transition: `background-color ${tokens.motion.fast}ms ${tokens.motion.easeOut}`,
              "&:focus-visible": {
                outline: `2px solid ${tokens.primary}`,
                outlineOffset: 2,
              },
              "&:disabled": { opacity: 0.5, cursor: "default" },
            }}
          >
            <FeatureTypeIcon type={type} size={24} />
            <span aria-hidden="true">{typeLabel(type)}</span>
          </Box>
        );
      })}
    </Box>
  );
}
