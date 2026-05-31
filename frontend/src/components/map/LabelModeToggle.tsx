interface LabelModeToggleProps {
  labelMode: "section" | "river";
  onChange: (mode: "section" | "river") => void;
}

export default function LabelModeToggle({
  labelMode,
  onChange,
}: LabelModeToggleProps) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 40,
        left: 8,
        zIndex: 10,
        display: "flex",
        borderRadius: 4,
        overflow: "hidden",
        boxShadow: "0 1px 4px rgba(0,0,0,0.35)",
        fontSize: 12,
      }}
    >
      {(["section", "river"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          style={{
            padding: "4px 10px",
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 12,
            background: labelMode === m ? "#1976d2" : "#fff",
            color: labelMode === m ? "#fff" : "#333",
            transition: "background 0.15s",
          }}
        >
          {m === "section" ? "Section" : "River"}
        </button>
      ))}
    </div>
  );
}
