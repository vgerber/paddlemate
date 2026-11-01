import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { MaterialModel } from "@/lib/api";
import { cardName, type ModelCardFacts } from "@/lib/materials/card";
import { cardTitleSx, labelSx } from "@/lib/theme/theme";
import { ModelTags } from "./ModelCardBody";
import ModelPhoto from "./ModelPhoto";

/** Side of the photo box of a phone row, px. */
export const ROW_PHOTO = 80;

const metaSx = {
  fontSize: "0.8125rem",
  lineHeight: "18px",
  color: "text.secondary",
  overflowWrap: "break-word",
} as const;

/** A model as a row of the phone list: the photo on the left, then brand,
 * name, what it is, the key figures on one line, and the tags. The order is
 * the card's, set in a column. */
export default function ModelRowBody({
  model,
  facts,
}: {
  model: MaterialModel;
  facts: ModelCardFacts;
}) {
  const figures = facts.specs.map((spec) => spec.value).filter(Boolean);
  return (
    <>
      <ModelPhoto
        model={model}
        sx={{ width: ROW_PHOTO, height: ROW_PHOTO, mr: 1.5, p: 0.5 }}
      />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ ...labelSx, lineHeight: "18px" }} noWrap>
          {model.brand}
        </Typography>{" "}
        <Typography
          sx={{
            ...cardTitleSx,
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 2,
            overflow: "hidden",
            overflowWrap: "anywhere",
          }}
        >
          {cardName(model)}
        </Typography>
        {facts.meta && <Typography sx={metaSx}>{facts.meta}</Typography>}
        {figures.length > 0 && (
          <Typography
            sx={{
              ...metaSx,
              color: "text.primary",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {figures.map((figure, index) => (
              // A value never breaks inside, only between two of them.
              <span key={figure}>
                {index > 0 && " · "}
                <span style={{ whiteSpace: "nowrap" }}>{figure}</span>
              </span>
            ))}
          </Typography>
        )}
        <ModelTags facts={facts} sx={{ mt: 0.5 }} />
      </Box>
    </>
  );
}
