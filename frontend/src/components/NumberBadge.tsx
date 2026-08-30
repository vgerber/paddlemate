import Box from "@mui/material/Box";
import { theme } from "@/lib/theme";

/** Small circular numbered badge, e.g. the ① / ② put-in and take-out marks. */
export default function NumberBadge({
  num,
  color,
  size = 18,
}: {
  num: number;
  color: string;
  size?: number;
}) {
  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: "50%",
        bgcolor: color,
        color: theme.tokens.white,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "0.6875rem",
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {num}
    </Box>
  );
}
