import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import AddPhotoButton from "@/components/materials/AddPhotoButton";
import type { Material } from "@/lib/api";
import { missingFields, missingSentence } from "@/lib/materials/missing";
import { theme } from "@/lib/theme/theme";

const { tokens } = theme;

/** The quiet invitation at the end of an entry's facts: what is missing, if
 * anything, and a link into the edit form (a proposal for non-admins). */
export default function SuggestChange({
  material,
  onSuggest,
}: {
  material: Material;
  onSuggest: () => void;
}) {
  const sentence = missingSentence(missingFields(material));
  return (
    <Box
      data-testid="suggest-change"
      sx={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        columnGap: 1,
        px: { xs: `${tokens.phone.edge}px`, md: 0 },
        py: 1,
      }}
    >
      <Typography
        variant="body2"
        color="textSecondary"
        sx={{ flex: "1 1 auto" }}
      >
        {sentence || "Something wrong?"}
      </Typography>
      {material.images.length === 0 && <AddPhotoButton material={material} />}
      <Button onClick={onSuggest} sx={{ minHeight: tokens.touch.min }}>
        Suggest a change
      </Button>
    </Box>
  );
}
