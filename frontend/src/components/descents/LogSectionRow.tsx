import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import { useNavigate } from "@tanstack/react-router";
import { factValueSx } from "@/components/Fact";
import { LevelPill } from "@/components/WaterLevelChip";
import { withAlpha } from "@/lib/alpha";
import type { DescentSection } from "@/lib/api";
import { uniqueSnapshotsBySeries } from "@/lib/descents";
import { formatReading } from "@/lib/format";
import { LogIcon } from "@/lib/icons";
import { EMPTY_MAP_SEARCH } from "@/lib/mapSearch";
import { theme } from "@/lib/theme";
import { useTokens } from "@/lib/useTokens";
import { levelConfigFor } from "@/lib/waterLevel";

const { tokens } = theme;
const { phone } = tokens;

const mutedSx = { fontSize: "0.8125rem", color: "text.secondary" } as const;

/** What a logged section says about itself: name, river, the paddler's note
 * and the water level at the time. Both row shapes show it. */
function SectionText({ section: s }: { section: DescentSection }) {
  const ink = useTokens();
  const snaps = uniqueSnapshotsBySeries(s.water_snapshots ?? []);
  return (
    <Box component="span" sx={{ display: "block", minWidth: 0 }}>
      <Box component="span" sx={{ ...factValueSx, fontWeight: 600 }}>
        {s.section_name ?? `Section #${s.section_id}`}
      </Box>{" "}
      {s.waterway_name && (
        <Box component="span" sx={mutedSx}>
          {s.waterway_name}
        </Box>
      )}
      {s.note && (
        <Box
          component="span"
          sx={{ ...mutedSx, display: "block", mt: 0.5, whiteSpace: "pre-wrap" }}
        >
          {s.note}
        </Box>
      )}
      {snaps.map((snap) => (
        <Box
          key={snap.series_id}
          component="span"
          sx={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 1,
            mt: 0.75,
          }}
        >
          <LevelPill level={snap.level}>
            {snap.value != null
              ? formatReading(snap.value, snap.unit)
              : levelConfigFor(ink)[snap.level].label}
          </LevelPill>
          <Box component="span" sx={mutedSx}>
            {snap.gauge_name}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

const orderSx = {
  ...factValueSx,
  display: "flex",
  alignItems: "center",
  gap: 0.5,
  color: "text.secondary",
  fontSize: "0.8125rem",
} as const;

/** A logged section that opens its river on the map. `variant` is the shape:
 * a line of the phone's section list, or a tile in the canvas card. */
export default function LogSectionRow({
  section,
  index,
  variant,
}: {
  section: DescentSection;
  /** Position in the paddled order, from 0. */
  index: number;
  variant: "line" | "tile";
}) {
  const navigate = useNavigate();
  const linked = section.waterway_id != null;
  const open = () =>
    navigate({
      to: "/",
      // Fresh map search state - only the target section.
      search: {
        ...EMPTY_MAP_SEARCH,
        waterway: section.waterway_id ?? undefined,
        section: section.section_id,
      },
    });
  const tile = variant === "tile";

  return (
    <ButtonBase
      data-testid="log-section"
      component={linked ? "button" : "div"}
      onClick={linked ? open : undefined}
      sx={{
        display: "grid",
        gridTemplateColumns: tile
          ? "auto minmax(0, 1fr)"
          : `${phone.icon}px minmax(0, 1fr)`,
        columnGap: tile ? 1.5 : `${phone.iconGap}px`,
        alignItems: "start",
        alignContent: "center",
        textAlign: "left",
        width: "100%",
        boxSizing: "border-box",
        font: "inherit",
        color: "text.primary",
        boxShadow: "none",
        cursor: linked ? "pointer" : "default",
        ...(tile
          ? {
              minHeight: 56,
              p: 1.5,
              bgcolor: tokens.surfaceHigh,
              borderRadius: `${tokens.radii.md}px`,
            }
          : {
              minHeight: tokens.touch.min,
              py: 1.25,
              "&:last-of-type": { pb: 0 },
              "&:not(:last-of-type)": {
                borderBottom: `1px solid ${withAlpha(tokens.outlineVariant, "hairline")}`,
              },
            }),
      }}
    >
      <Box
        component="span"
        sx={{
          ...orderSx,
          ...(tile ? { minWidth: 36 } : { justifyContent: "center" }),
        }}
      >
        {tile && <LogIcon sx={{ fontSize: 18 }} />}
        {index + 1}
      </Box>
      <SectionText section={section} />
    </ButtonBase>
  );
}
