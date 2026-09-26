import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import VisibilityPicker from "@/components/VisibilityPicker";
import { type StepProps, toDatetimeLocal } from "./model";

/** Step 3: title, note, visibility, and delayed publishing. */
export default function StepDetails({ form, onChange }: StepProps) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <TextField
        label="Title"
        value={form.name}
        onChange={(e) => onChange({ name: e.target.value })}
        fullWidth
        placeholder="Leave blank to use section / waterway name"
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

      <VisibilityPicker
        value={{
          type: form.visibility_type,
          groups: form.shared_groups,
          users: form.shared_users,
        }}
        onChange={(patch) =>
          onChange({
            ...(patch.type !== undefined && { visibility_type: patch.type }),
            ...(patch.groups !== undefined && { shared_groups: patch.groups }),
            ...(patch.users !== undefined && { shared_users: patch.users }),
          })
        }
      />

      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          {[
            { label: "1 day", days: 1 },
            { label: "1 week", days: 7 },
            { label: "1 month", days: 30 },
          ].map(({ label, days }) => (
            <Button
              key={days}
              size="small"
              variant="outlined"
              sx={{ fontSize: "0.6875rem", px: 1 }}
              onClick={() => {
                const d = new Date();
                d.setDate(d.getDate() + days);
                onChange({ visible_from: toDatetimeLocal(d.toISOString()) });
              }}
            >
              {label}
            </Button>
          ))}
          {form.visible_from && (
            <Button
              size="small"
              sx={{ fontSize: "0.6875rem", px: 1, ml: "auto" }}
              onClick={() => onChange({ visible_from: "" })}
            >
              Clear
            </Button>
          )}
        </Box>
        <TextField
          label="Publish after (optional)"
          type="datetime-local"
          value={form.visible_from}
          onChange={(e) => onChange({ visible_from: e.target.value })}
          fullWidth
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Box>
    </Box>
  );
}
