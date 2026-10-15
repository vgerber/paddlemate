import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import NumberBadge from "@/components/NumberBadge";
import { theme } from "@/lib/theme";

const { tokens } = theme;

/** One access point of a section as a white card: numbered badge, name, and
 * the position along the line (or "Not set") at the right. The clear control
 * is only there once the point is set. */
export default function SectionPointCard({
  num,
  color,
  name,
  detail,
  testId,
  clearLabel,
  onClear,
}: {
  num: number;
  color: string;
  name: string;
  detail: string;
  testId?: string;
  clearLabel?: string;
  onClear?: () => void;
}) {
  return (
    <Box
      data-testid={testId ?? "section-point-card"}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        pl: 1.75,
        pr: onClear ? 0.5 : 1.75,
        minHeight: 56,
        borderRadius: `${tokens.radii.md}px`,
        bgcolor: tokens.surface,
        boxShadow: tokens.elevation.e1,
      }}
    >
      <NumberBadge num={num} color={color} size={22} />
      <Typography
        sx={{ flex: 1, minWidth: 0, fontSize: "0.9375rem", fontWeight: 600 }}
      >
        {name}
      </Typography>
      <Typography variant="body2" color="textSecondary">
        {detail}
      </Typography>
      {onClear && (
        <IconButton
          aria-label={clearLabel}
          onClick={onClear}
          sx={{
            color: "text.secondary",
            width: tokens.touch.min,
            height: tokens.touch.min,
          }}
        >
          <DeleteOutlinedIcon fontSize="small" />
        </IconButton>
      )}
    </Box>
  );
}
