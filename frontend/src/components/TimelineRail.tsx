import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { theme } from "@/lib/theme";

const { tokens } = theme;

/** The left rail of a timeline entry: a dot on the entry's first line and a
 * connector down to the next one. `hollow` marks something not yet real - a
 * proposed feature, a planned day. */
export default function TimelineRail({
  isLast = false,
  hollow = false,
}: {
  isLast?: boolean;
  hollow?: boolean;
}) {
  return (
    <Stack
      direction="column"
      sx={{
        width: 16,
        flexShrink: 0,
        // Centers the 10px dot on the first text line.
        pt: "7px",
        alignItems: "center",
        alignSelf: "stretch",
      }}
    >
      <Box
        sx={
          hollow
            ? {
                width: 10,
                height: 10,
                borderRadius: "50%",
                border: `2px solid ${tokens.outline}`,
                bgcolor: tokens.surface,
                flexShrink: 0,
                mb: "4px",
              }
            : {
                width: 10,
                height: 10,
                borderRadius: "50%",
                bgcolor: tokens.primary,
                flexShrink: 0,
                mb: "4px",
              }
        }
      />
      {!isLast && (
        <Box
          sx={{
            width: 2,
            flex: 1,
            minHeight: 20,
            bgcolor: tokens.outlineVariant,
            borderRadius: `${tokens.radii.pill}px`,
            mt: "4px",
            mb: "4px",
          }}
        />
      )}
    </Stack>
  );
}
