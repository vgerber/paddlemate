import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import { CloseIcon } from "@/lib/icons";
import { labelSx, theme } from "@/lib/theme";
import { type GaugeStateMeta, stateMeta } from "./gaugeStates";
import type { MapGroup } from "./groupByProximity";

const { tokens } = theme;

/** The merged location and every gauge reported there. */
export default function GaugeDetailCard({
  selected,
  states,
  onClose,
}: {
  selected: MapGroup;
  states: GaugeStateMeta[];
  onClose: () => void;
}) {
  return (
    <Box
      sx={{
        position: "absolute",
        top: 14,
        left: 10,
        zIndex: 11,
        width: 270,
        maxWidth: "calc(100% - 20px)",
        maxHeight: "calc(100% - 28px)",
        overflowY: "auto",
        bgcolor: tokens.surface,
        borderRadius: `${tokens.radii.md}px`,
        boxShadow: tokens.elevation.e2,
        p: 1.5,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 1,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ wordBreak: "break-word" }}>
            {selected.river || selected.name || selected.station_id}
          </Typography>
          <Typography sx={{ ...labelSx, display: "block" }}>
            {selected.members.length > 1
              ? `${selected.members.length} gauges here`
              : "1 gauge"}
          </Typography>
        </Box>
        <IconButton
          onClick={() => onClose()}
          sx={{
            mt: -1.5,
            mr: -1.5,
            width: tokens.touch.min,
            height: tokens.touch.min,
          }}
          aria-label="Close"
        >
          <CloseIcon fontSize="inherit" />
        </IconButton>
      </Box>

      <Box sx={{ mt: 1, display: "flex", flexDirection: "column", gap: 1 }}>
        {selected.members.map((m) => {
          const meta = stateMeta(states, m.state);
          return (
            <Box
              key={`${m.provider}:${m.station_id}`}
              sx={{ display: "flex", gap: 0.75, alignItems: "flex-start" }}
            >
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  bgcolor: meta.color,
                  flexShrink: 0,
                  mt: 0.4,
                }}
              />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ wordBreak: "break-word" }}>
                  {m.name || m.river || m.station_id}
                </Typography>
                <Typography
                  variant="caption"
                  color="textSecondary"
                  sx={{ display: "block" }}
                >
                  {m.provider} · {meta.label}
                  {m.params && m.params.length > 0
                    ? ` · ${m.params.join(", ")}`
                    : ""}
                </Typography>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
