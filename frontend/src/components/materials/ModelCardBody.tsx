import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { MaterialModel } from "@/lib/api";
import { cardName, type ModelCardFacts } from "@/lib/materials/card";
import { withAlpha } from "@/lib/theme/alpha";
import { cardTitleSx, labelSx, theme } from "@/lib/theme/theme";
import ModelPhoto from "./ModelPhoto";

const { tokens } = theme;

/** Height of every card's photo box, px. */
export const CARD_PHOTO = 144;

const LINE = 18;

const clampSx = (lines: number) =>
  ({
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: lines,
    overflow: "hidden",
    overflowWrap: "anywhere",
  }) as const;

const metaSx = {
  fontSize: "0.8125rem",
  lineHeight: `${LINE}px`,
  color: "text.secondary",
} as const;

const tagSx = {
  ...labelSx,
  display: "inline-flex",
  alignItems: "center",
  height: 24,
  px: 1,
  borderRadius: `${tokens.radii.sm}px`,
  bgcolor: tokens.surfaceHigh,
  whiteSpace: "nowrap",
} as const;

/** The size tags and the availability tag, in one row. The sizes carry the
 * `model-sizes` test id and read "S M L" as text. */
export function ModelTags({
  facts,
  sx,
}: {
  facts: ModelCardFacts;
  sx?: object;
}) {
  if (!facts.discontinued && facts.sizes.length === 0) return null;
  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 0.5,
        ...sx,
      }}
    >
      {facts.discontinued && (
        <Box
          component="span"
          data-testid="availability-label"
          sx={{ ...tagSx, color: "text.secondary" }}
        >
          {facts.discontinued}
        </Box>
      )}
      {facts.sizes.length > 0 && (
        <Box
          component="span"
          data-testid="model-sizes"
          sx={{ display: "inline-flex", flexWrap: "wrap", gap: 0.5 }}
        >
          {facts.sizes.map((size, index) => (
            <span key={size}>
              {index > 0 && " "}
              <Box component="span" sx={tagSx}>
                {size}
              </Box>
            </span>
          ))}
        </Box>
      )}
    </Box>
  );
}

/** A model as a card of the desktop grid: photo, brand, name, what it is,
 * then the key specs and the tags at the foot, so every card in a grid row
 * shows the same blocks on the same lines. */
export default function ModelCardBody({
  model,
  facts,
  tagRow,
}: {
  model: MaterialModel;
  facts: ModelCardFacts;
  /** Keep the tag row's room; set when any card of the grid has tags. */
  tagRow: boolean;
}) {
  return (
    <>
      <ModelPhoto
        model={model}
        sx={{ width: "100%", height: CARD_PHOTO, p: 1 }}
      />
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          width: "100%",
          px: 1,
          pt: 1.5,
          pb: 0.5,
        }}
      >
        <Typography sx={{ ...labelSx, lineHeight: `${LINE}px`, ...clampSx(1) }}>
          {model.brand}
        </Typography>
        {/* The space makes brand and name read as one phrase in text. */}{" "}
        <Typography
          sx={{
            ...cardTitleSx,
            ...clampSx(2),
            minHeight: 40,
          }}
        >
          {cardName(model)}
        </Typography>
        <Typography sx={{ ...metaSx, ...clampSx(2), mt: 0.25 }}>
          {facts.meta}
        </Typography>
        <Box
          component="dl"
          sx={{
            display: "grid",
            gridTemplateColumns: "auto minmax(0, 1fr)",
            columnGap: 1.5,
            m: 0,
            mt: "auto",
            pt: 1,
            borderTop: `1px solid ${withAlpha(tokens.outlineVariant, "hairline")}`,
          }}
        >
          {facts.specs.map((spec) => (
            <Box
              key={spec.label}
              sx={{ display: "contents" }}
              aria-hidden={spec.value ? undefined : true}
            >
              <Box
                component="dt"
                sx={{
                  ...metaSx,
                  visibility: spec.value ? "visible" : "hidden",
                }}
              >
                {spec.label}
              </Box>
              <Box
                component="dd"
                sx={{
                  ...metaSx,
                  m: 0,
                  textAlign: "right",
                  color: "text.primary",
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {spec.value}
              </Box>
            </Box>
          ))}
        </Box>
        {tagRow && (
          <Box sx={{ minHeight: 24, mt: 1 }}>
            <ModelTags facts={facts} />
          </Box>
        )}
      </Box>
    </>
  );
}
