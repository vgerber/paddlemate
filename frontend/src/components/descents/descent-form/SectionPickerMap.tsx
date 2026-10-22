import Box from "@mui/material/Box";
import WaterwayMap from "@/components/map/LazyMap";
import { theme } from "@/lib/theme";
import type { SectionPicking } from "./useSectionPicking";

const { tokens } = theme;

interface Props {
  picking: SectionPicking;
  /** Fill the pane it sits in instead of a fixed height. */
  fill?: boolean;
  /** Show the picks without letting a click change them. */
  readOnly?: boolean;
}

/** Map for toggling sections and picking put-in/take-out points. */
export default function SectionPickerMap({ picking, fill, readOnly }: Props) {
  const { sectionsForMap: sections, selectedIds, putIn, takeOut } = picking;
  return (
    <Box
      sx={{
        height: fill ? "100%" : 380,
        borderRadius: `${tokens.radii.md}px`,
        overflow: "hidden",
        position: "relative",
        ...(fill && { boxShadow: tokens.elevation.e1 }),
      }}
    >
      <WaterwayMap
        sections={sections}
        picking={{
          selectedSectionIds: selectedIds,
          onSectionToggle: readOnly
            ? undefined
            : (id) => {
                const section = sections.find((s) => s.id === id);
                if (section) picking.toggleSection(section);
              },
          putIn,
          takeOut,
          onPickPutIn: readOnly ? undefined : picking.pickPutIn,
          onPickTakeOut: readOnly ? undefined : picking.pickTakeOut,
        }}
        chrome={{ minimal: true }}
      />
    </Box>
  );
}
