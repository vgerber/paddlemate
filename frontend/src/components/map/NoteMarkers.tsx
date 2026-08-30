import ChatBubbleIcon from "@mui/icons-material/ChatBubble";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { Marker, Popup } from "react-map-gl/maplibre";
import { labelSx, theme } from "@/lib/theme";

const { tokens } = theme;

export interface NotePin {
  id: number;
  lon: number;
  lat: number;
  /** Category color; carries the hazard/cleared/urgent meaning. */
  color: string;
  categoryLabel: string;
  body: string;
  author?: string;
  age?: string;
}

/** Notes pinned to the water, drawn as a speech-bubble badge in the note's
 * category color. Selection is shared with the thread: clicking a badge
 * selects the note (and opens its text in a popup), and a note selected in
 * the thread lights its badge up here. */
export default function NoteMarkers({
  pins,
  selectedId,
  onSelect,
  onOpenThread,
}: {
  pins: NotePin[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  /** Popup action: jump to the note in its thread (mobile, where clicking
   * a marker only opens this popup so the map stays readable). */
  onOpenThread?: (id: number) => void;
}) {
  const openPin = pins.find((pin) => pin.id === selectedId) ?? null;

  return (
    <>
      {pins.map((pin) => {
        const selected = pin.id === selectedId;
        return (
          <Marker
            key={pin.id}
            longitude={pin.lon}
            latitude={pin.lat}
            anchor="bottom"
          >
            <button
              type="button"
              title={pin.body}
              aria-label={`${pin.categoryLabel} note`}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(pin.id);
              }}
              onTouchEnd={(event) => {
                // Some mobile browsers swallow the synthesized click on
                // elements over the map canvas; act on the touch itself.
                event.preventDefault();
                event.stopPropagation();
                onSelect(pin.id);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: selected ? 26 : 22,
                height: selected ? 26 : 22,
                background: selected ? pin.color : tokens.surfaceLowest,
                border: selected
                  ? `2px solid ${tokens.white}`
                  : `2px solid ${pin.color}`,
                // Map-marker legibility shadow (documented token exception)
                boxShadow: selected
                  ? "0 0 0 2px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.6)"
                  : "0 1px 4px rgba(0,0,0,0.5)",
                cursor: "pointer",
                padding: 0,
                transition: "width 0.1s, height 0.1s",
              }}
            >
              <ChatBubbleIcon
                sx={{
                  fontSize: selected ? 14 : 12,
                  color: selected ? tokens.surfaceLowest : pin.color,
                }}
              />
            </button>
          </Marker>
        );
      })}

      {openPin && (
        <Popup
          longitude={openPin.lon}
          latitude={openPin.lat}
          anchor="bottom"
          offset={26}
          closeButton={false}
          onClose={() => onSelect(null)}
        >
          <Box sx={{ minWidth: 150, maxWidth: 240 }}>
            <Typography sx={{ ...labelSx, color: openPin.color }}>
              {openPin.categoryLabel}
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.25 }}>
              {openPin.body}
            </Typography>
            {(openPin.author || openPin.age) && (
              <Typography sx={{ ...labelSx, display: "block", mt: 0.5 }}>
                {[openPin.author, openPin.age].filter(Boolean).join(" · ")}
              </Typography>
            )}
            {onOpenThread && (
              <Link
                component="button"
                type="button"
                onClick={() => onOpenThread(openPin.id)}
                sx={{ ...labelSx, mt: 0.75, color: tokens.primary }}
              >
                Open in notes
              </Link>
            )}
          </Box>
        </Popup>
      )}
    </>
  );
}
