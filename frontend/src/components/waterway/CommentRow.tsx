import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useEffect, useRef } from "react";
import { phoneRowPad } from "@/components/canvas/flatRow";
import RowMenu, { type RowAction } from "@/components/RowMenu";
import { withAlpha } from "@/lib/alpha";
import type { Comment, Media } from "@/lib/api";
import { categoryColor, categoryLabel } from "@/lib/comments";
import { humanize, timeAgo } from "@/lib/format";
import { pointCoords } from "@/lib/geo";
import { DeleteIcon, PlaceIcon } from "@/lib/icons";
import { theme } from "@/lib/theme";
import { useTokens } from "@/lib/useTokens";

const { tokens } = theme;

/** One note in a thread, as a calm card. The category dot and label lead and
 * are the only things allowed colour, so a hazard stands out among trip
 * reports; a note an editor has folded into curated data or retired is
 * dimmed rather than hidden. */
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
  const ink = useTokens();
  const color = categoryColor(comment.category, ink);
  const retired = comment.status !== "ok";
  const noteCoords = comment.location ? pointCoords(comment.location) : null;

  // Selecting from the map scrolls the note into view in the thread.
  const rowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (selected) {
      rowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selected]);

  const actions: RowAction[] = [];
  if (noteCoords && onFocusLocation) {
    actions.push({
      label: "Show on map",
      icon: <PlaceIcon fontSize="small" />,
      onClick: () => onFocusLocation(noteCoords),
    });
  }
  if (canDelete) {
    actions.push({
      label: "Delete note",
      icon: <DeleteIcon fontSize="small" />,
      danger: true,
      onClick: onDelete,
    });
  }

  return (
    <Box
      ref={rowRef}
      data-testid="note-card"
      data-retired={retired || undefined}
      onClick={onSelect}
      sx={{
        mx: 1.5,
        my: 1,
        px: "14px",
        ...phoneRowPad,
        py: 1.5,
        bgcolor: selected ? withAlpha(tokens.primary, "wash") : tokens.surface,
        borderRadius: `${tokens.radii.md}px`,
        boxShadow: tokens.elevation.e1,
        opacity: retired ? 0.55 : 1,
        cursor: onSelect ? "pointer" : "default",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
        <Box
          data-testid="note-dot"
          sx={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            flexShrink: 0,
            bgcolor: color ?? tokens.outline,
          }}
        />
        <Typography
          sx={{
            fontSize: "0.8125rem",
            fontWeight: 600,
            color: color ?? tokens.onSurfaceVariant,
            flexShrink: 0,
          }}
        >
          {categoryLabel(comment.category)}
        </Typography>
        {source && (
          <Typography
            sx={{ fontSize: "0.8125rem", color: tokens.outline, minWidth: 0 }}
            noWrap
          >
            {source}
          </Typography>
        )}
        {retired && (
          <Typography
            sx={{
              fontSize: "0.8125rem",
              fontWeight: 500,
              color: "text.secondary",
            }}
          >
            {humanize(comment.status).replace(/^./, (c) => c.toUpperCase())}
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        {/* Pulled into the card's padding so the menu does not add height. */}
        <Box sx={{ mr: -1.5, my: -0.5 }}>
          <RowMenu actions={actions} name="Comment" />
        </Box>
      </Box>

      <Box>
        <Typography
          data-testid="note-body"
          variant="body1"
          sx={{
            whiteSpace: "pre-wrap",
            // A pasted URL is one long word; let it break rather than
            // stretch the panel.
            overflowWrap: "anywhere",
            lineHeight: 1.4,
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
                  border: "none",
                  borderRadius: `${tokens.radii.xs}px`,
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
            mt: 0.75,
            fontSize: "0.75rem",
            color: tokens.outline,
            overflowWrap: "anywhere",
          }}
        >
          {comment.author_name ?? "Someone"} · {timeAgo(comment.created_at)}
        </Typography>
      </Box>
    </Box>
  );
}
