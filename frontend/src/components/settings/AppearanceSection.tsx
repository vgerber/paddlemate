import Box from "@mui/material/Box";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import FormSection from "@/components/waterway/FormSection";
import { type ColorMode, useColorMode } from "@/lib/colorMode";

const MODES: { value: ColorMode; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/** The device-local theme choice. MUI stores it and applies it without a
 * reload. */
export default function AppearanceSection() {
  const [mode, setMode] = useColorMode();

  return (
    <FormSection
      label="Theme"
      hint="Light, dark or follow the device. Saved on this device only."
    >
      <Box sx={{ maxWidth: 360 }}>
        <ToggleButtonGroup
          exclusive
          fullWidth
          value={mode}
          onChange={(_, v: ColorMode | null) => v && setMode(v)}
          aria-label="Theme"
        >
          {MODES.map((m) => (
            <ToggleButton key={m.value} value={m.value} sx={{ flex: 1 }}>
              {m.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>
    </FormSection>
  );
}
