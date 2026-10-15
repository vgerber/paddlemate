import Box from "@mui/material/Box";
import Fab from "@mui/material/Fab";
import { theme } from "@/lib/theme";

const { tokens } = theme;

export type PickMode = "put-in" | "take-out";

function PickButton({
  num,
  label,
  active,
  activeColor,
  onClick,
}: {
  num: number;
  label: string;
  active: boolean;
  activeColor: string;
  onClick: () => void;
}) {
  return (
    <Fab
      variant="extended"
      onClick={onClick}
      aria-pressed={active}
      sx={{
        gap: 1,
        px: 2,
        fontSize: "0.875rem",
        fontWeight: 600,
        textTransform: "none",
        boxShadow: tokens.elevation.e2,
        "&:hover": {
          boxShadow: tokens.elevation.e2,
          backgroundColor: active ? activeColor : tokens.surfaceHigh,
        },
        backgroundColor: active ? activeColor : tokens.surface,
        color: active ? tokens.onPrimary : tokens.onSurface,
      }}
    >
      <Box
        component="span"
        sx={{
          width: 24,
          height: 24,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "50%",
          fontSize: "0.75rem",
          fontWeight: 700,
          color: active ? activeColor : tokens.onPrimary,
          backgroundColor: active ? tokens.surface : activeColor,
        }}
      >
        {num}
      </Box>
      {label}
    </Fab>
  );
}

/** Put-in / take-out pick toggles floated over the map's top-left corner,
 * in the same calm button style as the page's other floating actions. */
export default function PickModeButtons({
  pickMode,
  onToggle,
  showPutIn,
  showTakeOut,
}: {
  pickMode: PickMode | null;
  onToggle: (mode: PickMode) => void;
  showPutIn: boolean;
  showTakeOut: boolean;
}) {
  return (
    <Box
      sx={{
        position: "absolute",
        top: 10,
        left: 10,
        zIndex: 10,
        display: "flex",
        flexWrap: "wrap",
        gap: 1,
        maxWidth: "calc(100% - 20px)",
      }}
    >
      {showPutIn && (
        <PickButton
          num={1}
          label="Put-in"
          active={pickMode === "put-in"}
          activeColor={tokens.primary}
          onClick={() => onToggle("put-in")}
        />
      )}
      {showTakeOut && (
        <PickButton
          num={2}
          label="Take-out"
          active={pickMode === "take-out"}
          activeColor={tokens.primary}
          onClick={() => onToggle("take-out")}
        />
      )}
    </Box>
  );
}
