import Box from "@mui/material/Box";
import WaterwayMap from "@/components/map/LazyMap";
import { theme } from "@/lib/theme";
import type { SectionPicking } from "./useSectionPicking";

const { tokens } = theme;

interface Props {
  picking: SectionPicking;
}

/** Phone map for toggling sections and picking put-in/take-out points. */
export default function SectionPickerMap({ picking }: Props) {
  const { sectionsForMap: sections, selectedIds, putIn, takeOut } = picking;
  const pinnable = selectedIds.size > 0;
  return (
    <Box
      sx={{
        height: 380,
        borderRadius: `${tokens.radii.md}px`,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <WaterwayMap
        sections={sections}
        picking={{
          selectedSectionIds: selectedIds,
          onSectionToggle: (id) => {
            const section = sections.find((s) => s.id === id);
            if (section) picking.toggleSection(section);
          },
          putIn,
          takeOut,
          // Put-in and take-out only mean something once there is a route.
          onPickPutIn: pinnable ? picking.pickPutIn : undefined,
          onPickTakeOut: pinnable ? picking.pickTakeOut : undefined,
        }}
        chrome={{ minimal: true }}
      />
    </Box>
  );
}
