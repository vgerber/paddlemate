import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import { useEffect, useRef } from "react";
import type { Comment, Media } from "@/lib/api";
import { categoryColor, categoryLabel } from "@/lib/comments";
import { timeAgo } from "@/lib/format";
import { pointCoords } from "@/lib/geo";
import { labelSx, theme } from "@/lib/theme";

const { tokens } = theme;

/** One note in a thread. The category leads and is the only thing allowed
 * colour, so a hazard stands out among trip reports; a note an editor has
 * folded into curated data or retired is dimmed rather than hidden. */
export default function CommentRow({
  comment,
  source,
  canDelete,
  onDelete,
  onOpenMedia,
  onFocusLocation,
  selected = false,
  onSelect,
}: {
  comment: Comment;
  /** Which section a note came from, in the river-wide overview. */
  source?: string;
  canDelete: boolean;
  onDelete: () => void;
  onOpenMedia: (media: Media) => void;
  /** Fly the map to the note's pin (map page only). */
  onFocusLocation?: (lngLat: [number, number]) => void;
  /** Highlighted, in step with the note's marker on the map. */
  selected?: boolean;
  onSelect?: () => void;
}) {
  const color = categoryColor(comment.category);
  const retired = comment.status !== "ok";
  const noteCoords = comment.location ? pointCoords(comment.location) : null;

  // Selecting from the map scrolls the note into view in the thread.
  const rowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (selected) {
      rowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selected]);

  return (
    <Box
      ref={rowRef}
      onClick={onSelect}
      sx={{
        display: "flex",
        gap: 1.25,
        py: 1.25,
        px: selected ? 1 : 0,
        mx: selected ? -1 : 0,
        borderBottom: "1px solid",
        borderColor: `${tokens.outlineVariant}55`,
        opacity: retired ? 0.5 : 1,
        cursor: onSelect ? "pointer" : "default",
        bgcolor: selected ? `${tokens.primary}14` : "transparent",
      }}
    >
      {/* A colour bar carries the category at a glance; neutral kinds get a
          quiet one so the list still has a rhythm. */}
      <Box
        sx={{
          width: 2,
          flexShrink: 0,
          bgcolor: color ?? `${tokens.outlineVariant}99`,
        }}
      />

      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Box
          sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}
        >
          <Typography
            sx={{
              ...labelSx,
              color: color ?? "text.secondary",
              flexShrink: 0,
            }}
          >
            {categoryLabel(comment.category)}
          </Typography>
          {source && (
            <Typography
              sx={{ ...labelSx, color: "text.disabled", minWidth: 0 }}
              noWrap
            >
              {source}
            </Typography>
          )}
          {retired && (
            <Typography sx={{ ...labelSx, color: "text.disabled" }}>
              {comment.status}
            </Typography>
          )}
          <Box sx={{ flex: 1 }} />
          {noteCoords && onFocusLocation && (
            <IconButton
              size="small"
              aria-label="Show on map"
              title="Show on map"
              onClick={(event) => {
                event.stopPropagation();
                onFocusLocation(noteCoords);
              }}
              sx={{
                p: { xs: 0.75, md: 0.5 },
                color: "text.disabled",
                "& .MuiSvgIcon-root": { fontSize: { xs: 18, md: 15 } },
              }}
            >
              <LocationOnIcon />
            </IconButton>
          )}
          {canDelete && (
            <IconButton
              size="small"
              aria-label="Delete note"
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
              sx={{
                p: { xs: 0.75, md: 0.5 },
                mr: { xs: -0.5, md: 0 },
                color: "text.disabled",
                "& .MuiSvgIcon-root": { fontSize: { xs: 19, md: 16 } },
              }}
            >
              <DeleteOutlineIcon />
            </IconButton>
          )}
        </Box>

        <Typography
          variant="body2"
          sx={{
            mt: 0.25,
            whiteSpace: "pre-wrap",
            // A pasted URL is one long word; let it break rather than
            // stretch the panel.
            overflowWrap: "anywhere",
            lineHeight: 1.5,
          }}
        >
          {comment.body}
        </Typography>

        {comment.media && comment.media.length > 0 && (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 1 }}>
            {comment.media.map((item) => (
              <Box
                key={item.id}
                component="button"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenMedia(item);
                }}
                title={item.caption ?? "Open photo"}
                aria-label={item.caption ?? "Open photo"}
                sx={{
                  display: "block",
                  p: 0,
                  cursor: "zoom-in",
                  width: 72,
                  height: 72,
                  border: "1px solid",
                  borderColor: `${tokens.outlineVariant}55`,
                  backgroundImage: `url(${item.thumbnail_url ?? item.url})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              />
            ))}
          </Box>
        )}

        <Typography
          sx={{
            ...labelSx,
            display: "block",
            mt: 0.75,
            fontSize: "0.625rem",
            overflowWrap: "anywhere",
          }}
        >
          {comment.author_name ?? "Someone"} · {timeAgo(comment.created_at)}
        </Typography>
      </Box>
    </Box>
  );
}
