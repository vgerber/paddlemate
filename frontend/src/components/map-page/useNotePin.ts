import { useState } from "react";

/** The note composer's map pin and the note the thread and the map's note
 * markers share. Placing routes the next map click to the pin; the draft pin
 * rides along until the note is posted. */
export function useNotePin() {
  const [notePinPlacing, setNotePinPlacing] = useState(false);
  const [notePin, setNotePin] = useState<[number, number] | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  return {
    notePinPlacing,
    setNotePinPlacing,
    notePin,
    setNotePin,
    selectedNoteId,
    setSelectedNoteId,
  };
}
