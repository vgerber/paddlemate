import ButtonBase from "@mui/material/ButtonBase";
import { withAlpha } from "@/lib/alpha";
import { ThumbDownIcon, ThumbUpIcon } from "@/lib/icons";
import { fonts, theme } from "@/lib/theme";

const { tokens } = theme;

/** The one vote control: a thumb and its count, teal while it is the
 * viewer's own vote. Red and green stay with water levels. */
export default function VoteButton({
  direction,
  label,
  count,
  pressed,
  disabled = false,
  onClick,
}: {
  direction: "up" | "down";
  label: string;
  count: number;
  pressed: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const Icon = direction === "up" ? ThumbUpIcon : ThumbDownIcon;
  return (
    <ButtonBase
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      sx={{
        minWidth: tokens.touch.min,
        minHeight: tokens.touch.min,
        gap: 0.75,
        px: 1.5,
        borderRadius: `${tokens.radii.sm}px`,
        border: "1px solid",
        borderColor: pressed ? tokens.primary : tokens.outlineVariant,
        bgcolor: pressed ? withAlpha(tokens.primary, "tint") : "transparent",
        color: pressed ? tokens.primary : tokens.onSurfaceVariant,
        fontFamily: fonts.body,
        fontWeight: 600,
        fontSize: "0.8125rem",
        "&.Mui-disabled": { opacity: 0.5 },
      }}
    >
      <Icon sx={{ fontSize: 18 }} />
      {count}
    </ButtonBase>
  );
}
