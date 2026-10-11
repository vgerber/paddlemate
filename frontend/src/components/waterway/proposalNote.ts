/** Longest note the API accepts. */
export const PROPOSAL_NOTE_MAX = 500;

/** The note as sent: trimmed, null when empty. */
export function proposalNoteValue(note: string): string | null {
  return note.trim() || null;
}
