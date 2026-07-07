import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import { useQueryClient } from "@tanstack/react-query";
import { type RefObject, useEffect, useState } from "react";
import { sectionsApi } from "@/lib/api";
import { waterwayKeys } from "@/lib/hooks/useWaterways";
import type { Coordinate } from "@/lib/riverSnap";

interface SuggestSectionFormProps {
  waterwayId: number;
  putIn: { lat: number; lon: number } | null;
  takeOut: { lat: number; lon: number } | null;
  /** Final section line (snapped or straight), chosen in the stepper. */
  finalCoords: Coordinate[] | null;
  onSubmitted: () => void;
  submitRef?: RefObject<(() => void) | null>;
  onCanSubmitChange?: (can: boolean) => void;
}

/** Details step of the suggest-section wizard: name, region, country,
 * description. Location picking and OSM snapping happen in earlier steps. */
export default function SuggestSectionForm({
  waterwayId,
  putIn,
  takeOut,
  finalCoords,
  onSubmitted,
  submitRef,
  onCanSubmitChange,
}: SuggestSectionFormProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [country, setCountry] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const hasLocation = putIn != null && takeOut != null;
  const canSubmit = !!(name.trim() && hasLocation && !submitting);

  // No dependency list: keep the ref pointing at the latest handleSubmit
  useEffect(() => {
    if (submitRef) submitRef.current = handleSubmit;
  });
  useEffect(() => {
    onCanSubmitChange?.(canSubmit);
  }, [canSubmit, onCanSubmitChange]);

  async function handleSubmit() {
    if (!name.trim() || !hasLocation) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const coordinates: [number, number][] =
        finalCoords && finalCoords.length >= 2
          ? finalCoords
          : [
              [putIn.lon, putIn.lat],
              [takeOut.lon, takeOut.lat],
            ];
      await sectionsApi.create(waterwayId, {
        name: name.trim(),
        region: region.trim() || null,
        country: country.trim() || null,
        description: description.trim() || null,
        location: {
          type: "LineString",
          coordinates,
        } as never,
      });
      queryClient.invalidateQueries({
        queryKey: waterwayKeys.detail(waterwayId),
      });
      onSubmitted();
    } catch {
      setSubmitError("Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
        "& .MuiInputBase-inputSizeSmall": {
          py: { xs: "12px", md: "8.5px" },
        },
      }}
    >
      <TextField
        label="Name"
        size="small"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        fullWidth
      />
      <Box sx={{ display: "flex", gap: 1 }}>
        <TextField
          label="Region"
          size="small"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          fullWidth
        />
        <TextField
          label="Country"
          size="small"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          fullWidth
          sx={{ maxWidth: 90 }}
        />
      </Box>
      <TextField
        label="Description"
        size="small"
        multiline
        rows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        fullWidth
      />

      {submitError && (
        <Alert severity="error" sx={{ py: 0.25, fontSize: "0.75rem" }}>
          {submitError}
        </Alert>
      )}
    </Box>
  );
}
