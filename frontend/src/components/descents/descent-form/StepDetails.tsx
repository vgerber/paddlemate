import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import TextField from "@mui/material/TextField";
import ChipRow from "@/components/ChipRow";
import VisibilityPicker from "@/components/VisibilityPicker";
import FormSection from "@/components/waterway/FormSection";
import { type StepProps, toDatetimeLocal } from "./model";

/** Step 3: title, note, visibility, and delayed publishing. */
export default function StepDetails({ form, onChange }: StepProps) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <FormSection
        label="Title and note"
        hint="Leave the title blank to use the section and waterway name."
      >
        <TextField
          label="Title"
          value={form.name}
          onChange={(e) => onChange({ name: e.target.value })}
          fullWidth
          slotProps={{ htmlInput: { maxLength: 255 } }}
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

      <FormSection label="Who can see it" hint="Private logs are only yours.">
        <VisibilityPicker
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
        hint="Optional. The log stays hidden from others until then."
        action={
          form.visible_from ? (
            <Button onClick={() => onChange({ visible_from: "" })}>
              Clear
            </Button>
          ) : undefined
        }
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
              onClick={() => {
                const d = new Date();
                d.setDate(d.getDate() + days);
                onChange({ visible_from: toDatetimeLocal(d.toISOString()) });
              }}
            />
          ))}
        </ChipRow>
        <TextField
          label="Publish after"
          type="datetime-local"
          value={form.visible_from}
          onChange={(e) => onChange({ visible_from: e.target.value })}
          fullWidth
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </FormSection>
    </Box>
  );
}
