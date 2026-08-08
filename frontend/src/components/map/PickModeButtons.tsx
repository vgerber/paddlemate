import { fonts, theme } from "@/lib/theme";

const { tokens } = theme;

export type PickMode = "put-in" | "take-out";

function PickButton({
  label,
  active,
  activeColor,
  onClick,
}: {
  label: string;
  active: boolean;
  activeColor: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active ? activeColor : `${tokens.background}e0`,
        color: "white",
        border: `1px solid ${active ? `${activeColor}e6` : `${tokens.primary}59`}`,
        padding: "4px 10px",
        fontSize: 11,
        fontFamily: fonts.label,
        letterSpacing: "0.06em",
        cursor: "pointer",
        fontWeight: 600,
      }}
    >
      {label}
    </button>
  );
}

/** Put-in / take-out pick toggles floated over the map's top-left corner. */
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
    <div
      style={{
        position: "absolute",
        top: 8,
        left: 8,
        zIndex: 10,
        display: "flex",
        gap: 6,
      }}
    >
      {showPutIn && (
        <PickButton
          label="① PUT-IN"
          active={pickMode === "put-in"}
          activeColor={tokens.putIn}
          onClick={() => onToggle("put-in")}
        />
      )}
      {showTakeOut && (
        <PickButton
          label="② TAKE-OUT"
          active={pickMode === "take-out"}
          activeColor={tokens.takeOut}
          onClick={() => onToggle("take-out")}
        />
      )}
    </div>
  );
}
