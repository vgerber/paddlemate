import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { theme } from "@/lib/theme";

const { tokens } = theme;

/** The round primary-action button used in panel bottom bars. While `busy`
 * it shows a spinner in place of its icon and ignores clicks. */
export function RoundActionButton({
  onClick,
  disabled,
  busy,
  ariaLabel,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <IconButton
      onClick={onClick}
      disabled={disabled || busy}
      aria-label={ariaLabel}
      sx={{
        width: 52,
        height: 52,
        borderRadius: `${tokens.radii.lg}px`,
        bgcolor: tokens.primaryFill,
        color: tokens.onPrimary,
        boxShadow: tokens.elevation.e3,
        "&:hover": { bgcolor: tokens.primaryFillHover },
        "&.Mui-disabled": {
          bgcolor: tokens.surfaceHighest,
          color: tokens.outline,
          boxShadow: "none",
        },
      }}
    >
      {busy ? <CircularProgress size={22} color="inherit" /> : children}
    </IconButton>
  );
}

/** Bottom action bar shared by the suggest panels and the wizards: a text
 * button left (its label is `leftLabel`), a centred title block, and the
 * primary action right. With `steps`, one bar per step sits under the
 * subtitle and the done ones are filled. */
export default function PanelBottomBar({
  onLeftClick,
  leftLabel,
  leftDisabled,
  title,
  subtitle,
  steps,
  action,
}: {
  onLeftClick: () => void;
  leftLabel: string;
  leftDisabled?: boolean;
  title: string;
  subtitle: string;
  steps?: { n: number; of: number };
  action: ReactNode;
}) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns:
          "minmax(64px, 1fr) minmax(0, 2fr) minmax(64px, 1fr)",
        alignItems: "center",
        minHeight: 76,
        px: { xs: `${tokens.phone.line}px`, md: 2 },
        pb: "env(safe-area-inset-bottom)",
        bgcolor: tokens.surface,
        borderTop: "1px solid",
        borderColor: "divider",
        flexShrink: 0,
        gap: 1,
        boxSizing: "border-box",
      }}
    >
      <ButtonBase
        onClick={onLeftClick}
        disabled={leftDisabled}
        sx={{
          justifySelf: "start",
          minHeight: tokens.touch.min,
          minWidth: tokens.touch.min,
          fontWeight: 600,
          fontSize: "0.9375rem",
          color: "text.secondary",
          borderRadius: `${tokens.radii.sm}px`,
        }}
      >
        {leftLabel}
      </ButtonBase>
      <Box sx={{ minWidth: 0, textAlign: "center" }}>
        <Typography noWrap sx={{ fontSize: "1rem", fontWeight: 700 }}>
          {title}
        </Typography>
        <Typography
          noWrap
          color="textSecondary"
          sx={{ fontSize: "0.8125rem", lineHeight: "18px" }}
        >
          {subtitle}
        </Typography>
        {steps && (
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              gap: 0.5,
              mt: 0.5,
            }}
          >
            {Array.from({ length: steps.of }, (_, i) => (
              <Box
                key={i}
                data-step-bar={i < steps.n ? "done" : "todo"}
                sx={{
                  width: 18,
                  height: 4,
                  borderRadius: `${tokens.radii.bar}px`,
                  bgcolor: i < steps.n ? tokens.primary : tokens.outlineVariant,
                }}
              />
            ))}
          </Box>
        )}
      </Box>
      <Box sx={{ justifySelf: "end" }}>{action}</Box>
    </Box>
  );
}
