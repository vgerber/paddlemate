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
        // Centers the 12px dot on the first text line (text pt 4px +
        // ~8px half line height - 6px half dot).
        pt: "6px",
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
                border: `1.5px solid ${tokens.onSurfaceVariant}`,
                opacity: 0.45,
                flexShrink: 0,
                mb: "4px",
              }
            : {
                width: 12,
                height: 12,
                borderRadius: "50%",
                bgcolor: tokens.primary,
                flexShrink: 0,
                boxShadow: `0 0 10px ${tokens.primary}99, 0 0 4px ${tokens.primary}`,
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
            bgcolor: tokens.outline,
            opacity: 0.45,
            mt: "4px",
            mb: "4px",
          }}
        />
      )}
    </Stack>
  );
}
