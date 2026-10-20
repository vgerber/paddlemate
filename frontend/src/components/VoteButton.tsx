import ThumbDownOutlinedIcon from "@mui/icons-material/ThumbDownOutlined";
import ThumbUpOutlinedIcon from "@mui/icons-material/ThumbUpOutlined";
import ButtonBase from "@mui/material/ButtonBase";
import { alphas, fonts, theme } from "@/lib/theme";

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
  const Icon = direction === "up" ? ThumbUpOutlinedIcon : ThumbDownOutlinedIcon;
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
        bgcolor: pressed ? `${tokens.primary}${alphas.tint}` : "transparent",
        color: pressed ? tokens.primary : tokens.onSurfaceVariant,
        fontFamily: fonts.label,
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
