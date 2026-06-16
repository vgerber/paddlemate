import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import DoneIcon from "@mui/icons-material/Done";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { useCopyToClipboard } from "@/lib/hooks/useCopyToClipboard";
import { fonts, theme } from "@/lib/theme";

const { tokens } = theme;

interface Props {
  coords: [number, number]; // [lng, lat]
  actions?: ReactNode;
}

/** Formatted coordinate pair with copy and Google Maps buttons. Pass `actions` to append extra buttons to the same row. */
export function CoordsInfo({ coords, actions }: Props) {
  const [lng, lat] = coords;
  const { copied, copy } = useCopyToClipboard();
  const url = `https://www.google.com/maps?q=${lat},${lng}`;

  return (
    <Stack direction="row" sx={{ mt: "4px", alignItems: "center", gap: "2px", ml: "-4px" }}>
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
        title={copied ? "Copied!" : "Copy coordinates"}
        onClick={(e) => { e.stopPropagation(); copy(`${lat.toFixed(5)}, ${lng.toFixed(5)}`); }}
        sx={{ color: copied ? tokens.primary : tokens.secondary }}
      >
        {copied ? <DoneIcon fontSize="small" /> : <ContentCopyOutlinedIcon fontSize="small" />}
      </IconButton>
      <IconButton
        size="small"
        title="Open in Google Maps"
        component="a"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        sx={{ color: tokens.secondary }}
      >
        <OpenInNewIcon fontSize="small" />
      </IconButton>
      {actions}
    </Stack>
  );
}
