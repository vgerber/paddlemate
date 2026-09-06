import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useState } from "react";
import type { SectionDraft } from "@/components/descents/descent-form/model";
import { makeDraft } from "@/components/descents/descent-form/model";
import SectionDraftList from "@/components/descents/descent-form/SectionDraftList";
import SectionAdder from "@/components/search/SectionAdder";
import type { SectionWithFeatures, TripStay } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api/client";
import { useReplaceStaySections } from "@/lib/hooks/useTrips";
import { useWaterway } from "@/lib/hooks/useWaterways";
import { theme } from "@/lib/theme";

interface Props {
  tripId: number;
  stay: TripStay;
  open: boolean;
  onClose: () => void;
}

function initDrafts(stay: TripStay): SectionDraft[] {
  return [...stay.sections]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => ({
      key: String(s.section_id),
      section_id: s.section_id,
      sort_order: s.sort_order,
      note: s.note ?? "",
      display_name: s.section_name ?? `Section #${s.section_id}`,
    }));
}

/**
 * The sections watched from one base. Scoped to the stay, not the trip: two
 * camps a kilometre apart reach the same rivers, and each keeps its own list.
 */
export default function StaySectionsDialog({
  tripId,
  stay,
  open,
  onClose,
}: Props) {
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  const [drafts, setDrafts] = useState<SectionDraft[]>(() => initDrafts(stay));
  const [waterwayId, setWaterwayId] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { data: waterway } = useWaterway(waterwayId);
  const replaceSections = useReplaceStaySections(tripId);

  const addedIds = new Set(drafts.map((d) => d.section_id));

  function addSection(section: SectionWithFeatures) {
    if (addedIds.has(section.id)) return;
    setDrafts((prev) => [...prev, makeDraft(section, prev.length + 1)]);
  }

  async function handleSave() {
    setSaveError(null);
    try {
      await replaceSections.mutateAsync({
        stayId: stay.id,
        sections: drafts.map((d, i) => ({
          section_id: d.section_id,
          sort_order: i + 1,
          note: d.note || null,
          status: null,
        })),
      });
      onClose();
    } catch (err) {
      setSaveError(apiErrorMessage(err, "Saving failed. Please try again."));
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      fullScreen={fullScreen}
    >
      <DialogTitle>Watch list</DialogTitle>
      <DialogContent
        sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}
      >
        <Typography variant="caption" color="text.secondary">
          Rivers the group is watching from {stay.name}.
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <SectionAdder
            waterwayId={waterwayId}
            onWaterwayChange={setWaterwayId}
            sections={waterway?.sections ?? []}
            addedIds={addedIds}
            onAdd={addSection}
          />
          <SectionDraftList sections={drafts} onChange={setDrafts} />
        </Box>
        {saveError && <Alert severity="error">{saveError}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={replaceSections.isPending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="secondary"
          onClick={handleSave}
          disabled={replaceSections.isPending}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
