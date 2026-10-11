import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import GlobalStyles from "@mui/material/GlobalStyles";
import Typography from "@mui/material/Typography";
import { Popup } from "react-map-gl/maplibre";
import { theme } from "@/lib/theme";

const { tokens } = theme;

export interface RegionChoice {
  id: number;
  label: string;
  /** Country and level, under the name. */
  sub: string;
}

const CARD_CLASS = "region-choices-popup";

/** Which region did you mean? Regions overlap - a side valley runs into the
 * main one, a district sits under a range - so a click on shared ground is
 * ambiguous. The innermost region is already picked; the stack under the
 * pointer is listed smallest first so any other can be taken instead, and the
 * row under focus lights its region on the map. */
export default function RegionChoicePopup({
  at,
  choices,
  pickedId,
  onPick,
  onLight,
  onClose,
}: {
  at: { lng: number; lat: number };
  choices: RegionChoice[];
  pickedId: number;
  onPick: (regionId: number) => void;
  onLight: (regionId: number | null) => void;
  onClose: () => void;
}) {
  return (
    // No anchor: MapLibre then picks the side with room, which keeps the
    // list on screen when the tap lands near an edge of a phone screen.
    <Popup
      longitude={at.lng}
      latitude={at.lat}
      offset={12}
      maxWidth="min(280px, calc(100vw - 32px))"
      closeButton={false}
      className={CARD_CLASS}
      onClose={onClose}
    >
      <GlobalStyles
        styles={{
          [`.${CARD_CLASS} .maplibregl-popup-content`]: {
            padding: 0,
            borderRadius: tokens.radii.md,
            boxShadow: tokens.elevation.e2,
            backgroundColor: tokens.surface,
            overflow: "hidden",
          },
          [`.${CARD_CLASS} .maplibregl-popup-tip`]: { display: "none" },
        }}
      />
      <Box data-testid="region-choices" sx={{ minWidth: 200 }}>
        <Typography
          sx={{
            px: 2,
            pt: 1.5,
            pb: 0.5,
            fontSize: "0.75rem",
            fontWeight: 600,
            color: tokens.onSurfaceVariant,
          }}
        >
          {choices.length} regions here
        </Typography>
        {choices.map((choice) => {
          const picked = choice.id === pickedId;
          return (
            <ButtonBase
              key={choice.id}
              aria-current={picked || undefined}
              onClick={() => onPick(choice.id)}
              onMouseEnter={() => onLight(choice.id)}
              onMouseLeave={() => onLight(null)}
              onFocus={() => onLight(choice.id)}
              onBlur={() => onLight(null)}
              sx={{
                display: "flex",
                width: "100%",
                minHeight: tokens.touch.row,
                px: 2,
                justifyContent: "flex-start",
                textAlign: "left",
                color: picked ? tokens.primary : tokens.onSurface,
                "&:hover, &:focus-visible": {
                  backgroundColor: tokens.surfaceHigh,
                },
              }}
            >
              <Box sx={{ minWidth: 0, py: 0.75 }}>
                <Typography
                  noWrap
                  sx={{ fontSize: "0.9375rem", fontWeight: picked ? 600 : 500 }}
                >
                  {choice.label}
                </Typography>
                {choice.sub && (
                  <Typography
                    noWrap
                    sx={{ fontSize: "0.75rem", color: tokens.onSurfaceVariant }}
                  >
                    {choice.sub}
                  </Typography>
                )}
              </Box>
            </ButtonBase>
          );
        })}
      </Box>
    </Popup>
  );
}
