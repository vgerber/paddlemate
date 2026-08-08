import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import type { ReactNode } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Explanatory text under the title; omit when children carry the body. */
  body?: string;
  confirmLabel: string;
  /** Label while the action runs, e.g. "Deleting…". */
  pendingLabel?: string;
  color?: "primary" | "error" | "success";
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  /** Extra content between body and actions (a note field, an error alert). */
  children?: ReactNode;
}

/** The app's one confirmation dialog: Cancel plus a colored confirm button
 * that disables and relabels while the action is pending. */
export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  pendingLabel,
  color = "primary",
  pending = false,
  onCancel,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={pending ? undefined : onCancel}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {body && (
          <DialogContentText sx={{ mb: children ? 2 : 0 }}>
            {body}
          </DialogContentText>
        )}
        {children}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button onClick={onConfirm} color={color} disabled={pending}>
          {pending ? (pendingLabel ?? confirmLabel) : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
