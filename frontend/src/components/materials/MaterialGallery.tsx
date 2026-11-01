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

/** The photos of an entry. Each sits in a box of fixed proportions, so the
 * page does not jump as the files arrive, opens in the photo viewer on a
 * click, and carries its credit: a link to the source page for a mirrored
 * photo, plain text for one a paddler added. */
export default function MaterialGallery({ material }: { material: Material }) {
  const [viewing, setViewing] = useState<number | null>(null);
  if (material.images.length === 0) return null;
  const alt = `${material.brand} ${material.model}`;
  const photos = material.images.map((image) => ({
    id: image.id,
    src: image.url,
    alt,
    credit: image.credit,
    creditUrl: image.page_url ?? undefined,
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
          gap: 1,
          listStyle: "none",
          m: 0,
          p: 0,
          mx: { xs: `${tokens.phone.edge}px`, md: 0 },
          mb: 1,
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
            <PhotoCredit credit={image.credit} pageUrl={image.page_url} />
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

function PhotoCredit({
  credit,
  pageUrl,
}: {
  credit: string;
  pageUrl?: string | null;
}) {
  const text = (
    <Typography variant="body2" component="span">
      Photo: {credit}
    </Typography>
  );
  const sx = {
    display: "flex",
    alignItems: "center",
    gap: 0.75,
    minHeight: tokens.touch.min,
    // The credit sits on the text line of the cards below.
    px: `${tokens.phone.inner}px`,
    overflowWrap: "anywhere",
  } as const;
  if (!pageUrl) {
    return (
      <Box data-testid="photo-credit" sx={sx}>
        {text}
      </Box>
    );
  }
  return (
    <Link
      href={pageUrl}
      target="_blank"
      rel="noreferrer noopener"
      data-testid="photo-credit"
      sx={sx}
    >
      {text}
      <OpenExternalIcon sx={{ fontSize: 16 }} />
    </Link>
  );
}
