import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import type { Material } from "@/lib/api";
import { missingFields, missingSentence } from "@/lib/materials/missing";
import { withAlpha } from "@/lib/theme/alpha";
import { theme } from "@/lib/theme/theme";

const { tokens } = theme;

/** The one prompt of an entry's page, closing its overview card: what is
 * missing and the way to add it (a proposal for non-admins). Nothing when
 * nothing is missing - the header menu has the action for the rest. */
export default function SuggestChange({
  material,
  onSuggest,
}: {
  material: Material;
  onSuggest: () => void;
}) {
  const sentence = missingSentence(missingFields(material));
  if (!sentence) return null;
  return (
    <Box
      data-testid="suggest-change"
      sx={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        columnGap: 1,
        pt: 0.5,
        borderTop: `1px solid ${withAlpha(tokens.outlineVariant, "hairline")}`,
      }}
    >
      <Typography variant="body2" color="textSecondary">
        {sentence}
      </Typography>
      <Button onClick={onSuggest} sx={{ minHeight: tokens.touch.min, mr: -1 }}>
        Suggest a change
      </Button>
    </Box>
  );
}
