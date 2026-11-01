import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import PhotoViewer from "@/components/media/PhotoViewer";
import type { Material } from "@/lib/api";
import { OpenExternalIcon } from "@/lib/icons";
import { theme } from "@/lib/theme/theme";

const { tokens } = theme;

/** The mirrored photos of an entry. Each sits in a box of fixed proportions,
 * so the page does not jump as the files arrive, opens in the photo viewer on
 * a click, and carries the maker's credit as a link to the page it came
 * from. */
export default function MaterialGallery({ material }: { material: Material }) {
  const [viewing, setViewing] = useState<number | null>(null);
  if (material.images.length === 0) return null;
  const alt = `${material.brand} ${material.model}`;
  const photos = material.images.map((image) => ({
    id: image.id,
    src: image.url,
    alt,
    credit: image.credit,
    creditUrl: image.page_url,
  }));
  return (
    <>
      <Box
        component="ul"
        data-testid="material-gallery"
        sx={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fill, minmax(min(100%, 240px), 1fr))",
          gap: 2,
          listStyle: "none",
          m: 0,
          p: 0,
          mb: 2,
        }}
      >
        {material.images.map((image, i) => (
          <Box component="li" key={image.id} data-testid="material-photo">
            <ButtonBase
              onClick={() => setViewing(i)}
              aria-label={`View photo ${i + 1} of ${material.images.length} full size`}
              sx={{
                display: "block",
                width: "100%",
                cursor: "zoom-in",
                aspectRatio: "4 / 3",
                bgcolor: tokens.surfaceHigh,
                borderRadius: `${tokens.radii.md}px`,
                overflow: "hidden",
              }}
            >
              <Box
                component="img"
                src={image.url}
                alt={alt}
                loading="lazy"
                decoding="async"
                sx={{
                  display: "block",
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                }}
              />
            </ButtonBase>
            <Link
              href={image.page_url}
              target="_blank"
              rel="noreferrer noopener"
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.75,
                minHeight: tokens.touch.min,
                overflowWrap: "anywhere",
              }}
            >
              <Typography variant="body2" component="span">
                Photo: {image.credit}
              </Typography>
              <OpenExternalIcon sx={{ fontSize: 16 }} />
            </Link>
          </Box>
        ))}
      </Box>
      <PhotoViewer
        photos={photos}
        index={viewing}
        onIndexChange={setViewing}
        onClose={() => setViewing(null)}
      />
    </>
  );
}
