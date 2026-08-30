import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import type { Media } from "@/lib/api";
import { labelSx, theme } from "@/lib/theme";

const { tokens } = theme;

/** Full-size view of a photo. Closes on the backdrop, on Escape (MUI's own
 * handling) and on the image itself, since that is what a reader reaches
 * for first. Attribution rides along - it is the reason we store it. */
export default function ImageLightbox({
  media,
  onClose,
}: {
  media: Media | null;
  onClose: () => void;
}) {
  const attribution = [media?.copyright, media?.license_name]
    .filter(Boolean)
    .join(" · ");

  return (
    <Dialog
      open={media !== null}
      onClose={onClose}
      maxWidth={false}
      // Above the app's own overlays: MUI modals default to 1300, but the
      // mobile sheet and suggest chrome sit at 1350.
      sx={{ zIndex: 1400 }}
      slotProps={{
        paper: {
          sx: {
            bgcolor: tokens.surfaceLowest,
            border: "1px solid",
            borderColor: tokens.outlineVariant,
            maxWidth: "min(1200px, 96vw)",
            m: { xs: 1, md: 2 },
          },
        },
      }}
    >
      {media && (
        <Box
          sx={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <IconButton
            aria-label="Close"
            onClick={onClose}
            sx={{
              position: "absolute",
              top: 4,
              right: 4,
              bgcolor: `${tokens.surfaceLowest}cc`,
              border: "1px solid",
              borderColor: `${tokens.outlineVariant}99`,
              "&:hover": { bgcolor: tokens.surfaceHigh },
            }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>

          <Box
            component="img"
            src={media.url}
            alt={media.caption ?? "Photo"}
            onClick={onClose}
            sx={{
              display: "block",
              maxWidth: "100%",
              maxHeight: { xs: "70vh", md: "80vh" },
              objectFit: "contain",
              cursor: "zoom-out",
            }}
          />

          {(media.caption || attribution) && (
            <Box
              sx={{
                px: 1.5,
                py: 1,
                borderTop: "1px solid",
                borderColor: `${tokens.outlineVariant}55`,
              }}
            >
              {media.caption && (
                <Typography variant="body2">{media.caption}</Typography>
              )}
              {attribution && (
                <Typography sx={{ ...labelSx, display: "block", mt: 0.25 }}>
                  {media.license_url ? (
                    <Link
                      href={media.license_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      color="inherit"
                    >
                      {attribution}
                    </Link>
                  ) : (
                    attribution
                  )}
                </Typography>
              )}
            </Box>
          )}
        </Box>
      )}
    </Dialog>
  );
}
