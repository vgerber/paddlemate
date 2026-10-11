import Box from "@mui/material/Box";
import { alphas, fonts, theme } from "@/lib/theme";

const { tokens } = theme;

/** A member as a round initial. Decorative: the name is always beside it. */
export default function MemberAvatar({
  name,
  size = 36,
  ring = false,
}: {
  name: string;
  size?: number;
  /** A ring in the card colour, so overlapping avatars stay separate. */
  ring?: boolean;
}) {
  return (
    <Box
      data-testid="member-avatar"
      aria-hidden
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        bgcolor: `${tokens.primary}${alphas.wash}`,
        color: tokens.primary,
        fontFamily: fonts.label,
        fontWeight: 600,
        fontSize: size < 30 ? "0.6875rem" : "0.875rem",
        boxShadow: ring ? `0 0 0 2px ${tokens.surface}` : undefined,
      }}
    >
      {name.slice(0, 1).toUpperCase()}
    </Box>
  );
}
