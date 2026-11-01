import Button from "@mui/material/Button";
import { useState } from "react";
import AddPhotoDialog from "@/components/materials/AddPhotoDialog";
import type { Material } from "@/lib/api";
import { AddPhotoIcon } from "@/lib/icons";
import { theme } from "@/lib/theme/theme";

const { tokens } = theme;

/** "Add photo" for an entry, with its dialog. */
export default function AddPhotoButton({ material }: { material: Material }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        startIcon={<AddPhotoIcon />}
        onClick={() => setOpen(true)}
        data-testid="add-photo"
        sx={{ minHeight: tokens.touch.min }}
      >
        Add photo
      </Button>
      <AddPhotoDialog
        materialId={material.id}
        alt={`${material.brand} ${material.model}`}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
