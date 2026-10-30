import Box from "@mui/material/Box";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import FormSection from "@/components/waterway/FormSection";
import { type Units, useUnits } from "@/lib/units";

const CHOICES: {
  key: keyof Units;
  label: string;
  hint: string;
  options: { value: string; label: string }[];
}[] = [
  {
    key: "weight",
    label: "Weight",
    hint: "Boat and paddler weights.",
    options: [
      { value: "kg", label: "kg" },
      { value: "lb", label: "lb" },
    ],
  },
  {
    key: "distance",
    label: "Distance",
    hint: "Section lengths, feature positions and the search radius.",
    options: [
      { value: "km", label: "km" },
      { value: "mi", label: "mi" },
    ],
  },
  {
    key: "length",
    label: "Length",
    hint: "Boat dimensions. Volume follows: litres with cm, US gallons with in.",
    options: [
      { value: "cm", label: "cm" },
      { value: "in", label: "in" },
    ],
  },
];

/** The device-local unit choices. Gauge readings stay as the gauge reports
 * them. */
export default function UnitsSection() {
  const [units, setUnits] = useUnits();

  return (
    <>
      {CHOICES.map((choice) => (
        <FormSection
          key={choice.key}
          label={choice.label}
          hint={`${choice.hint} Saved on this device only.`}
        >
          <Box sx={{ maxWidth: 360 }}>
            <ToggleButtonGroup
              exclusive
              fullWidth
              value={units[choice.key]}
              onChange={(_, v: string | null) =>
                v && setUnits({ [choice.key]: v })
              }
              aria-label={choice.label}
            >
              {choice.options.map((o) => (
                <ToggleButton key={o.value} value={o.value} sx={{ flex: 1 }}>
                  {o.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>
        </FormSection>
      ))}
    </>
  );
}
