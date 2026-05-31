import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useStandingDescent } from "@/lib/hooks/useStandingDescent";

function elapsed(startTime: string): string {
  const ms = Date.now() - new Date(startTime).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function StandingDescentBanner() {
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
      sx={{
        bgcolor: "background.paper",
        borderBottom: "1px solid",
        borderColor: "divider",
        display: "flex",
        alignItems: "center",
        gap: 2,
        px: 2,
        py: 0.75,
      }}
    >
      <Box
        sx={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          bgcolor: "error.main",
          flexShrink: 0,
          animation: "pulse 1.5s ease-in-out infinite",
          "@keyframes pulse": {
            "0%, 100%": { opacity: 1 },
            "50%": { opacity: 0.25 },
          },
        }}
      />
      <Typography
        component="button"
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
          fontSize: "0.7rem",
          fontFamily: '"Space Grotesk", monospace',
          fontWeight: 600,
          letterSpacing: "0.06em",
          color: "text.secondary",
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          "&:hover": { color: "text.primary" },
        }}
      >
        {current.sectionName}
      </Typography>
      <Typography
        sx={{
          fontSize: "0.85rem",
          fontFamily: '"Space Grotesk", monospace',
          fontWeight: 700,
          letterSpacing: "0.04em",
          minWidth: 52,
          color: "text.primary",
        }}
      >
        {elapsed(current.startTime)}
      </Typography>
      <Box sx={{ ml: "auto", display: "flex", gap: 1 }}>
        <Button
          size="small"
          variant="contained"
          color="secondary"
          sx={{
            fontSize: "0.65rem",
            fontWeight: 700,
            letterSpacing: "0.08em",
          }}
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
        <Button
          size="small"
          sx={{
            fontSize: "0.65rem",
            color: "text.secondary",
            letterSpacing: "0.06em",
          }}
          onClick={discard}
        >
          Discard
        </Button>
      </Box>
    </Box>
  );
}
