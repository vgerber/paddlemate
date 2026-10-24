import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import RowMenu, { type RowAction } from "@/components/RowMenu";
import { useCopyToClipboard } from "@/lib/hooks/useCopyToClipboard";
import { useSession } from "@/lib/hooks/useSession";
import {
  ConfirmIcon,
  CopyIcon,
  DeleteIcon,
  EditIcon,
  HistoryIcon,
  OpenExternalIcon,
} from "@/lib/icons";
import { theme } from "@/lib/theme";

const { tokens } = theme;

const touchSx = {
  width: tokens.touch.min,
  height: tokens.touch.min,
  color: tokens.onSurfaceVariant,
} as const;

interface Props {
  coords: [number, number]; // [lng, lat]
  /** Extra inline buttons appended to the row (e.g. proposal votes). */
  actions?: ReactNode;
  /** Adds a "History" entry to the more-actions menu. */
  onHistory?: () => void;
  /** Adds an "Edit feature" entry ("Suggest a change" for non-admins) to the more-actions menu. */
  onEdit?: () => void;
  /** Adds a "Delete feature" entry to the more-actions menu. */
  onDelete?: () => void;
}

/** Formatted coordinate pair with a Google Maps button and a more-actions
 * menu (copy coordinates, plus the edit/delete feature actions). */
export function CoordsInfo({
  coords,
  actions,
  onHistory,
  onEdit,
  onDelete,
}: Props) {
  const [lng, lat] = coords;
  const { copied, copy } = useCopyToClipboard();
  const { isAdmin } = useSession();
  const url = `https://www.google.com/maps?q=${lat},${lng}`;

  const menuActions: RowAction[] = [
    {
      label: "Copy coordinates",
      icon: copied ? <ConfirmIcon /> : <CopyIcon />,
      onClick: () => copy(`${lat.toFixed(5)}, ${lng.toFixed(5)}`),
    },
  ];
  if (onHistory) {
    menuActions.push({
      label: "History",
      icon: <HistoryIcon />,
      onClick: onHistory,
    });
  }
  if (onEdit) {
    menuActions.push({
      label: isAdmin ? "Edit feature" : "Suggest a change",
      icon: <EditIcon />,
      onClick: onEdit,
    });
  }
  if (onDelete) {
    menuActions.push({
      label: "Delete feature",
      icon: <DeleteIcon />,
      onClick: onDelete,
      danger: true,
    });
  }

  return (
    <Stack
      direction="row"
      sx={{ mt: "4px", alignItems: "center", gap: "2px", ml: "-4px" }}
    >
      <Typography
        component="span"
        sx={{
          fontVariantNumeric: "tabular-nums",
          fontSize: 13,
          color: tokens.outline,
          flexGrow: 1,
        }}
      >
        {lat.toFixed(5)}, {lng.toFixed(5)}
      </Typography>
      <IconButton
        title="Open in Google Maps"
        component="a"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        sx={touchSx}
      >
        <OpenExternalIcon fontSize="small" />
      </IconButton>
      {actions}
      <RowMenu actions={menuActions} name="Feature" />
    </Stack>
  );
}
