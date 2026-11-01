import Box from "@mui/material/Box";
import type { SxProps, Theme } from "@mui/material/styles";
import type { MaterialModel } from "@/lib/api";
import { PhotoIcon } from "@/lib/icons";
import { theme } from "@/lib/theme/theme";

const { tokens } = theme;

/** The photo box of a model: product shots sit whole (contain) on a quiet
 * surface, and a model without one keeps the same box with an outline icon,
 * so a list never has a collapsed item. The caller sets the size. */
export default function ModelPhoto({
  model,
  sx,
}: {
  model: Pick<MaterialModel, "brand" | "model" | "thumb_url">;
  sx: SxProps<Theme>;
}) {
  return (
    <Box
      data-testid="material-thumb"
      sx={[
        {
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: `${tokens.radii.sm}px`,
          bgcolor: tokens.surfaceHigh,
          color: tokens.outline,
          overflow: "hidden",
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {model.thumb_url ? (
        <Box
          component="img"
          src={model.thumb_url}
          // The name beside it already says what it is.
          alt=""
          loading="lazy"
          decoding="async"
          sx={{
            display: "block",
            width: "100%",
            height: "100%",
            objectFit: "contain",
          }}
        />
      ) : (
        <PhotoIcon aria-hidden fontSize="large" />
      )}
    </Box>
  );
}
