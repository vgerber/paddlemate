import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import TextField from "@mui/material/TextField";
import ChipRow from "@/components/ChipRow";
import VisibilityPicker from "@/components/VisibilityPicker";
import FormSection from "@/components/waterway/FormSection";
import { theme } from "@/lib/theme";
import { type StepProps, toDatetimeLocal } from "./model";
import PickerField from "./PickerField";

/** Step 3: title, note, visibility, and delayed publishing. */
export default function StepDetails({ form, onChange }: StepProps) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <FormSection
        label="Details"
        hint="A title and a note for yourself and whoever may read the log."
      >
        <TextField
          label="Title"
          placeholder="Leave blank to use section / waterway name"
          value={form.name}
          onChange={(e) => onChange({ name: e.target.value })}
          fullWidth
          slotProps={{
            htmlInput: { maxLength: 255 },
            inputLabel: { shrink: true },
          }}
        />
        <TextField
          label="Note"
          value={form.note}
          onChange={(e) => onChange({ note: e.target.value })}
          multiline
          minRows={3}
          fullWidth
        />
      </FormSection>

      <FormSection label="Visibility" hint="Who can see this log.">
        <VisibilityPicker
          hideLabel
          value={{
            type: form.visibility_type,
            groups: form.shared_groups,
            users: form.shared_users,
          }}
          onChange={(patch) =>
            onChange({
              ...(patch.type !== undefined && { visibility_type: patch.type }),
              ...(patch.groups !== undefined && {
                shared_groups: patch.groups,
              }),
              ...(patch.users !== undefined && { shared_users: patch.users }),
            })
          }
        />
      </FormSection>

      <FormSection
        label="Publish after"
        hint="Optional. Hold the log back until a later time."
      >
        <ChipRow>
          {[
            { label: "1 day", days: 1 },
            { label: "1 week", days: 7 },
            { label: "1 month", days: 30 },
          ].map(({ label, days }) => (
            <Chip
              key={days}
              label={label}
              sx={{ height: theme.tokens.touch.min }}
              onClick={() => {
                const d = new Date();
                d.setDate(d.getDate() + days);
                onChange({ visible_from: toDatetimeLocal(d.toISOString()) });
              }}
            />
          ))}
        </ChipRow>
        <PickerField
          kind="datetime-local"
          label="Publish after"
          value={form.visible_from}
          onChange={(v) => onChange({ visible_from: v })}
          onClear={() => onChange({ visible_from: "" })}
          helperText="The log stays hidden from others until then."
        />
      </FormSection>
    </Box>
  );
}
