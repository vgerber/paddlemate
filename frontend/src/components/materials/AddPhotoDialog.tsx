import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import LinearProgress from "@mui/material/LinearProgress";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useEffect, useRef, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { apiErrorMessage } from "@/lib/api/client";
import { useAddMaterialPhoto } from "@/lib/hooks/useMaterials";
import { useSession } from "@/lib/hooks/useSession";
import { AddPhotoIcon, CameraIcon } from "@/lib/icons";
import { theme } from "@/lib/theme/theme";

const { tokens } = theme;

/** The API's limit; checked here so the person hears it before the upload. */
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_CREDIT = 80;

/** The picked file as an object URL for the preview, released on change. */
function usePreview(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

/** Add a photo to an entry: pick or take one, see it, say whose it is and
 * that it may be shared, then send. An admin's photo is live; anyone else's
 * is "Sent for review". Signed out, the dialog offers sign-in instead. */
export default function AddPhotoDialog({
  materialId,
  alt,
  open,
  onClose,
}: {
  materialId: number;
  /** What the photo shows, for the preview's description. */
  alt: string;
  open: boolean;
  onClose: () => void;
}) {
  const { isAuthenticated, isAdmin, user, login } = useSession();
  const add = useAddMaterialPhoto(materialId);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [credit, setCredit] = useState("");
  const [rights, setRights] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const touch = useMediaQuery("(pointer: coarse)");
  const preview = usePreview(file);

  useEffect(() => {
    if (open) return;
    setFile(null);
    setFileError(null);
    setCredit("");
    setRights(false);
    add.reset();
  }, [open, add.reset]);

  function pick(picked: File | undefined) {
    if (!picked) return;
    if (!picked.type.startsWith("image/") || picked.type === "image/svg+xml") {
      setFileError("Pick a JPEG, PNG, WebP or GIF image.");
      return;
    }
    if (picked.size > MAX_BYTES) {
      setFileError("The photo must be 8 MB or smaller.");
      return;
    }
    setFileError(null);
    setFile(picked);
  }

  if (!isAuthenticated) {
    return (
      <ConfirmDialog
        open={open}
        title="Add a photo"
        body="Sign in to add a photo to this entry."
        confirmLabel="Sign in"
        onCancel={onClose}
        onConfirm={login}
      />
    );
  }

  const send = () => {
    if (!file) return;
    add.mutate(
      {
        file,
        rightsConfirmed: rights,
        credit: credit.trim() || undefined,
      },
      { onSuccess: onClose },
    );
  };
  const error =
    fileError ??
    (add.error
      ? apiErrorMessage(add.error, "The photo could not be sent.")
      : null);

  return (
    <ConfirmDialog
      open={open}
      title="Add a photo"
      confirmLabel={isAdmin ? "Add photo" : "Send for review"}
      pendingLabel="Sending..."
      pending={add.isPending}
      confirmDisabled={!file || !rights}
      alignActions
      onCancel={onClose}
      onConfirm={send}
    >
      <Box
        data-testid="add-photo-form"
        sx={{ display: "flex", flexDirection: "column", gap: 2 }}
      >
        <Typography variant="body2" color="textSecondary">
          {isAdmin
            ? "The photo shows on every size of this model."
            : "An admin looks at the photo before it is shown. It shows on every size of this model."}
        </Typography>
        <input
          ref={picker}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          hidden
          data-testid="add-photo-input"
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {preview ? (
          <Box
            component="img"
            src={preview}
            alt={`Preview of your photo of ${alt}`}
            data-testid="add-photo-preview"
            sx={{
              width: "100%",
              aspectRatio: "4 / 3",
              objectFit: "contain",
              bgcolor: tokens.surfaceHigh,
              borderRadius: `${tokens.radii.md}px`,
            }}
          />
        ) : null}
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
          <Button
            variant={file ? "text" : "outlined"}
            startIcon={<AddPhotoIcon />}
            onClick={() => picker.current?.click()}
            disabled={add.isPending}
            sx={{ minHeight: tokens.touch.min }}
          >
            {file ? "Choose another" : "Choose a photo"}
          </Button>
          {touch && (
            <Button
              variant="outlined"
              startIcon={<CameraIcon />}
              onClick={() => camera.current?.click()}
              disabled={add.isPending}
              sx={{ minHeight: tokens.touch.min }}
            >
              Take a photo
            </Button>
          )}
        </Box>
        <TextField
          label="Credit"
          value={credit}
          onChange={(e) => setCredit(e.target.value)}
          placeholder={user?.username}
          helperText={`Shown as "Photo: ${credit.trim() || user?.username || "you"}"`}
          disabled={add.isPending}
          slotProps={{ htmlInput: { maxLength: MAX_CREDIT } }}
          fullWidth
        />
        <FormControlLabel
          // The drawn box (12 padding, 3 icon inset) starts on the content column.
          sx={{ alignItems: "flex-start", m: 0, ml: "-15px" }}
          control={
            <Checkbox
              checked={rights}
              onChange={(e) => setRights(e.target.checked)}
              disabled={add.isPending}
              sx={{ p: 1.5, mt: -0.5 }}
            />
          }
          label="This photo is mine, or I may share it."
          slotProps={{ typography: { variant: "body2", sx: { pt: 1 } } }}
        />
        {add.isPending && add.progress != null && (
          <LinearProgress
            variant="determinate"
            value={Math.round(add.progress * 100)}
            aria-label="Upload progress"
          />
        )}
        {error && <Alert severity="error">{error}</Alert>}
      </Box>
    </ConfirmDialog>
  );
}
