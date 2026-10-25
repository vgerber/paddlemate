import ButtonBase from "@mui/material/ButtonBase";
import { withAlpha } from "@/lib/alpha";
import { ThumbDownIcon, ThumbUpIcon } from "@/lib/icons";
import { transition } from "@/lib/motion";
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
      aria-label={`${label}, ${count}`}
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
        borderColor: pressed ? tokens.primary : tokens.outlineControl,
        bgcolor: pressed ? withAlpha(tokens.primary, "tint") : "transparent",
        color: pressed ? tokens.primary : tokens.onSurfaceVariant,
        fontFamily: fonts.body,
        fontWeight: 600,
        fontSize: "0.8125rem",
        transition: transition(["transform", "background-color", "color"], {
          duration: "fast",
        }),
        "&:active": {
          transform: "scale(0.985)",
          transition: transition("transform", { duration: "instant" }),
        },
        'html[data-motion="reduced"] &:active': { transform: "none" },
        "&.Mui-disabled": { opacity: 0.5, transition: "none" },
      }}
    >
      <Icon sx={{ fontSize: 18 }} />
      {count}
    </ButtonBase>
  );
}
