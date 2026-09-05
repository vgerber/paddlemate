import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import { Popup } from "react-map-gl/maplibre";
import { labelSx, theme } from "@/lib/theme";

const { tokens } = theme;
const PALETTE = tokens.mapRegionPalette;

export interface RegionChoice {
  id: number;
  label: string;
  paletteIndex: number;
}

/** Which region did you mean? Regions overlap - a side valley runs into the
 * main one, a district sits under a range - so a click on shared ground is
 * ambiguous, and picking whatever happens to be on top gives no way to reach
 * the rest. The stack under the pointer is listed smallest first, each row in
 * the colour its outline is drawn in so the row and the shape on the map read
 * as the same thing. */
export default function RegionChoicePopup({
  at,
  choices,
  onPick,
  onClose,
}: {
  at: { lng: number; lat: number };
  choices: RegionChoice[];
  onPick: (regionId: number) => void;
  onClose: () => void;
}) {
  return (
    // No anchor: MapLibre then picks the side with room, which keeps the
    // list on screen when the tap lands near an edge of a phone screen.
    <Popup
      longitude={at.lng}
      latitude={at.lat}
      offset={12}
      maxWidth="260px"
      closeButton={false}
      onClose={onClose}
    >
      <Box sx={{ minWidth: 160 }}>
        <Typography sx={{ ...labelSx, display: "block", mb: 0.5 }}>
          {choices.length} regions here
        </Typography>
        {choices.map((choice) => (
          <ButtonBase
            key={choice.id}
            onClick={() => onPick(choice.id)}
            sx={{
              display: "flex",
              width: "100%",
              // Comfortably tappable: on a phone this list is the answer to
              // a finger that could not hit one region cleanly.
              minHeight: 44,
              gap: 1,
              px: 0.5,
              justifyContent: "flex-start",
              "&:hover": { backgroundColor: tokens.surfaceHigh },
            }}
          >
            <Box
              sx={{
                width: 10,
                height: 10,
                flexShrink: 0,
                borderRadius: "50%",
                backgroundColor: PALETTE[choice.paletteIndex % PALETTE.length],
              }}
            />
            <Typography variant="body2" noWrap>
              {choice.label}
            </Typography>
          </ButtonBase>
        ))}
      </Box>
    </Popup>
  );
}
