import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import { useEffect, useRef, useState } from "react";
import type { Coord } from "@/lib/riverSnap";
import { useWaterway } from "@/lib/hooks/useWaterways";
import SuggestSectionForm from "./SuggestSectionForm";

interface SuggestSectionPanelProps {
  waterwayId: number;
  onClose: () => void;
  putIn: { lat: number; lon: number } | null;
  takeOut: { lat: number; lon: number } | null;
  pickingFor: "put-in" | "take-out" | null;
  onStartPickPutIn: () => void;
  onStartPickTakeOut: () => void;
  onDraftClear: () => void;
  onPreviewCoordsChange?: (coords: Coord[] | null) => void;
}

export default function SuggestSectionPanel({
  waterwayId,
  onClose,
  putIn,
  takeOut,
  pickingFor,
  onStartPickPutIn,
  onStartPickTakeOut,
  onDraftClear,
  onPreviewCoordsChange,
}: SuggestSectionPanelProps) {
  const { data: waterway } = useWaterway(waterwayId);
  const sections = waterway?.sections ?? [];

  const submitRef = useRef<(() => void) | null>(null);
  const [canSubmit, setCanSubmit] = useState(false);

  useEffect(() => {
    setCanSubmit(false);
  }, []);

  function handleClose() {
    onDraftClear();
    onClose();
  }

  return (
    <>
      <Box sx={{ flex: 1, overflowY: "auto" }}>
        <SuggestSectionForm
          waterwayId={waterwayId}
          waterwayName={waterway?.name ?? ""}
          sections={sections}
          putIn={putIn}
          takeOut={takeOut}
          pickingFor={pickingFor}
          onRequestPickPutIn={onStartPickPutIn}
          onRequestPickTakeOut={onStartPickTakeOut}
          onSubmitted={onClose}
          onPreviewCoordsChange={onPreviewCoordsChange}
          submitRef={submitRef}
          onCanSubmitChange={setCanSubmit}
        />
      </Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          px: 1,
          pt: 1,
          pb: "calc(8px + env(safe-area-inset-bottom))",
          borderTop: "1px solid",
          borderColor: "divider",
          flexShrink: 0,
          gap: 1,
        }}
      >
        <IconButton onClick={handleClose} aria-label="Cancel">
          <CloseIcon />
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" noWrap sx={{ fontWeight: 700 }}>
            {waterway?.name ?? "…"}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            Suggest new section
          </Typography>
        </Box>
        <IconButton
          size="large"
          onClick={() => submitRef.current?.()}
          disabled={!canSubmit}
          aria-label="Submit"
          sx={{
            borderRadius: "50%",
            bgcolor: "secondary.main",
            color: "secondary.contrastText",
            "&:hover": { bgcolor: "secondary.light" },
            "&.Mui-disabled": {
              bgcolor: "action.disabledBackground",
              color: "action.disabled",
            },
          }}
        >
          <CheckIcon fontSize="small" />
        </IconButton>
      </Box>
    </>
  );
}
