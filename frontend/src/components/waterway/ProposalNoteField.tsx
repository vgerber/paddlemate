import TextField from "@mui/material/TextField";
import FormSection from "./FormSection";
import { PROPOSAL_NOTE_MAX } from "./proposalNote";

interface ProposalNoteFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/** Optional message to the reviewers of a suggestion, with a character
 * counter. Sent as `proposal_note`. */
export default function ProposalNoteField({
  value,
  onChange,
  disabled,
}: ProposalNoteFieldProps) {
  return (
    <FormSection
      label="Note for reviewers"
      hint="Optional - why you suggest this, or where it comes from."
    >
      <TextField
        label="Note for reviewers"
        multiline
        minRows={2}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        slotProps={{ htmlInput: { maxLength: PROPOSAL_NOTE_MAX } }}
        helperText={`${value.length} / ${PROPOSAL_NOTE_MAX}`}
        fullWidth
      />
    </FormSection>
  );
}
