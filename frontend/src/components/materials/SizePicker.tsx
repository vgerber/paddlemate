import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import { factLabelSx } from "@/components/Fact";
import { theme } from "@/lib/theme/theme";

const { tokens } = theme;

/** The sizes of a model as a one-choice group of 44px chips. The picked
 * entry's id is in the URL, so a size is a link. */
export default function SizePicker({
  sizes,
  pickedId,
  onPick,
}: {
  sizes: { id: number; size?: string | null }[];
  pickedId: number;
  onPick: (id: number) => void;
}) {
  return (
    <Box role="radiogroup" aria-label="Size" data-testid="size-picker">
      <Typography sx={{ ...factLabelSx, mb: 0.5 }}>Size</Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
        {sizes.map(({ id, size }) => {
          const set = id === pickedId;
          return (
            <Chip
              key={id}
              role="radio"
              aria-checked={set}
              variant="outlined"
              color={set ? "primary" : "default"}
              clickable
              onClick={() => onPick(id)}
              label={size ?? "-"}
              sx={{
                height: tokens.touch.min,
                minWidth: 56,
                "&.Mui-focusVisible": {
                  outline: `2px solid ${tokens.primary}`,
                  outlineOffset: 2,
                },
              }}
            />
          );
        })}
      </Box>
    </Box>
  );
}
