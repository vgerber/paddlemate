import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import DoneIcon from "@mui/icons-material/Done";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import IconButton from "@mui/material/IconButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { type ReactNode, useState } from "react";
import { useCopyToClipboard } from "@/lib/hooks/useCopyToClipboard";
import { fonts, theme } from "@/lib/theme";

const { tokens } = theme;

interface Props {
  coords: [number, number]; // [lng, lat]
  /** Extra inline buttons appended to the row (e.g. proposal votes). */
  actions?: ReactNode;
  /** Adds an "Edit feature" entry to the more-actions menu. */
  onEdit?: () => void;
  /** Adds a "Delete feature" entry to the more-actions menu. */
  onDelete?: () => void;
}

/** Formatted coordinate pair with a Google Maps button and a more-actions
 * menu (copy coordinates, plus the edit/delete feature actions). */
export function CoordsInfo({ coords, actions, onEdit, onDelete }: Props) {
  const [lng, lat] = coords;
  const { copied, copy } = useCopyToClipboard();
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const url = `https://www.google.com/maps?q=${lat},${lng}`;

  return (
    <Stack
      direction="row"
      sx={{ mt: "4px", alignItems: "center", gap: "2px", ml: "-4px" }}
    >
      <Typography
        component="span"
        sx={{
          fontFamily: fonts.mono,
          fontSize: 13,
          color: tokens.outline,
          letterSpacing: "0.03em",
          flexGrow: 1,
        }}
      >
        {lat.toFixed(5)}, {lng.toFixed(5)}
      </Typography>
      <IconButton
        size="small"
        title="Open in Google Maps"
        component="a"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        sx={{ color: tokens.success }}
      >
        <OpenInNewIcon fontSize="small" />
      </IconButton>
      {actions}
      <IconButton
        size="small"
        title="More actions"
        onClick={(e) => {
          e.stopPropagation();
          setMenuAnchor(e.currentTarget);
        }}
        sx={{ color: tokens.success }}
      >
        <MoreVertIcon fontSize="small" />
      </IconButton>
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
        // The menu portal is a React child of the entry's ButtonBase - stop
        // clicks from toggling the entry.
        onClick={(e) => e.stopPropagation()}
      >
        <MenuItem
          sx={{ py: 1.25 }}
          onClick={() => {
            copy(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
            setMenuAnchor(null);
          }}
        >
          <ListItemIcon>
            {copied ? (
              <DoneIcon fontSize="small" />
            ) : (
              <ContentCopyOutlinedIcon fontSize="small" />
            )}
          </ListItemIcon>
          Copy coordinates
        </MenuItem>
        {onEdit && (
          <MenuItem
            sx={{ py: 1.25 }}
            onClick={() => {
              setMenuAnchor(null);
              onEdit();
            }}
          >
            <ListItemIcon>
              <EditOutlinedIcon fontSize="small" />
            </ListItemIcon>
            Edit feature
          </MenuItem>
        )}
        {onDelete && (
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              onDelete();
            }}
            sx={{ py: 1.25, color: tokens.error }}
          >
            <ListItemIcon>
              <DeleteOutlinedIcon
                fontSize="small"
                sx={{ color: tokens.error }}
              />
            </ListItemIcon>
            Delete feature
          </MenuItem>
        )}
      </Menu>
    </Stack>
  );
}
