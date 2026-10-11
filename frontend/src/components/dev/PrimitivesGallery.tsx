import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import BottomSheet from "@/components/BottomSheet";
import ChipRow from "@/components/ChipRow";
import FeatureTypeIcon, {
  FEATURE_ICON_PATHS,
  type FeatureIconSize,
} from "@/components/FeatureTypeIcon";
import type { FeatureType } from "@/lib/api";
import type { SheetState } from "@/lib/sheetSnap";
import { labelSx } from "@/lib/theme";

const CHIPS = [
  "Whitewater",
  "Rapid",
  "Freestyle spot",
  "Hole",
  "Siphon",
  "Strainer",
  "Weir",
  "Dam",
  "Waterfall",
  "Portage",
];
const TYPES = Object.keys(FEATURE_ICON_PATHS) as FeatureType[];
const SIZES: FeatureIconSize[] = [16, 24];

/** Development-only page that mounts the shared parts nothing else mounts yet,
 * so the browser tests can drive them. Served at /dev/primitives. */
export default function PrimitivesGallery() {
  const [picked, setPicked] = useState("");
  const [sheet, setSheet] = useState<SheetState | "closed">("closed");
  return (
    <Box
      sx={{
        p: 2,
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr)",
        gap: 3,
      }}
    >
      <Box>
        <Typography sx={labelSx}>Bottom sheet</Typography>
        <Button variant="outlined" onClick={() => setSheet("peek")}>
          Open sheet
        </Button>
        <BottomSheet
          state={sheet}
          onStateChange={setSheet}
          label="Gallery sheet"
        >
          <Box sx={{ p: 2, display: "grid", gap: 1 }}>
            <Button>First action</Button>
            <Button>Second action</Button>
          </Box>
        </BottomSheet>
      </Box>

      <Box>
        <Typography sx={labelSx}>Chip row</Typography>
        <Box data-testid="chip-row">
          <ChipRow>
            {CHIPS.map((c) => (
              <Chip
                key={c}
                label={c}
                onClick={() => setPicked(c)}
                color={picked === c ? "primary" : "default"}
              />
            ))}
          </ChipRow>
        </Box>
      </Box>

      <Box>
        <Typography sx={labelSx}>Feature type icons</Typography>
        {SIZES.map((size) => (
          <Box
            key={size}
            data-testid={`icons-${size}`}
            sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, py: 1 }}
          >
            {TYPES.map((type) => (
              <FeatureTypeIcon key={type} type={type} size={size} />
            ))}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
