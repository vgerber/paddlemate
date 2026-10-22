import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import type { SxProps } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useStandingDescent } from "@/lib/hooks/useStandingDescent";
import { CloseIcon } from "@/lib/icons";
import { theme } from "@/lib/theme";

const { tokens } = theme;

function elapsed(startTime: string): string {
  const ms = Date.now() - new Date(startTime).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function StandingDescentBanner({ sx }: { sx?: SxProps }) {
  const { current, discard } = useStandingDescent();
  const navigate = useNavigate();
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!current) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [current]);

  if (!current) return null;

  return (
    <Box
      data-testid="standing-banner"
      sx={[
        {
          bgcolor: tokens.surface,
          borderRadius: `${tokens.radii.md}px`,
          boxShadow: tokens.elevation.e2,
          display: "flex",
          alignItems: "center",
          columnGap: { xs: 1, sm: 1.5 },
          m: 1,
          pl: 2,
          pr: 1,
          py: 0.5,
          minHeight: 56,
          boxSizing: "border-box",
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box
        sx={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          bgcolor: tokens.primary,
          flexShrink: 0,
        }}
      />
      <ButtonBase
        onClick={() =>
          navigate({
            to: "/",
            from: "/",
            search: (prev) => ({
              ...prev,
              waterway: current.waterwayId,
              section: current.sectionId,
            }),
          })
        }
        sx={{
          flex: "1 1 0",
          minWidth: 0,
          minHeight: tokens.touch.min,
          justifyContent: "flex-start",
          textAlign: "left",
          font: "inherit",
          fontSize: "0.9375rem",
          fontWeight: 600,
          color: "text.primary",
        }}
      >
        <Box
          component="span"
          sx={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {current.sectionName}
        </Box>
      </ButtonBase>
      <Typography
        sx={{
          fontSize: "0.9375rem",
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          color: "text.secondary",
        }}
      >
        {elapsed(current.startTime)}
      </Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <Button
          variant="contained"
          color="primary"
          sx={{ minHeight: tokens.touch.min, textTransform: "none", px: 2 }}
          onClick={() => {
            const { waterwayId, sectionId, startTime } = current;
            discard();
            navigate({
              to: "/logs/new",
              search: { waterwayId, sectionId, startTime },
            });
          }}
        >
          Finish
        </Button>
        <IconButton
          aria-label="Discard"
          onClick={discard}
          sx={{
            width: tokens.touch.min,
            height: tokens.touch.min,
            color: "text.secondary",
          }}
        >
          <CloseIcon sx={{ fontSize: 22 }} />
        </IconButton>
      </Box>
    </Box>
  );
}
