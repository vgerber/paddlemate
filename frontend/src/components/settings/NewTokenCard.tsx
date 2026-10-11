import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import DoneIcon from "@mui/icons-material/Done";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import { useCopyToClipboard } from "@/lib/hooks/useCopyToClipboard";
import { alphas, fonts, theme } from "@/lib/theme";

const { tokens } = theme;

/** A new token, shown once: the secret, a copy button and a way to dismiss. */
export default function NewTokenCard({
  token,
  onDone,
}: {
  token: string;
  onDone: () => void;
}) {
  const { copied, copy } = useCopyToClipboard();

  return (
    <Box
      data-testid="new-token"
      sx={{
        p: 2,
        display: "flex",
        flexDirection: "column",
        gap: 1,
        bgcolor: `${tokens.primary}${alphas.tint}`,
        border: "1px solid",
        borderColor: `${tokens.primary}${alphas.border}`,
        borderRadius: `${tokens.radii.md}px`,
      }}
    >
      <Typography sx={{ fontWeight: 600 }}>
        Copy this token - it won't be shown again.
      </Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Typography
          sx={{
            flex: 1,
            minWidth: 0,
            fontFamily: fonts.mono,
            fontSize: "0.875rem",
            wordBreak: "break-all",
          }}
        >
          {token}
        </Typography>
        <IconButton
          aria-label={copied ? "Copied" : "Copy token"}
          title={copied ? "Copied" : "Copy token"}
          onClick={() => copy(token)}
        >
          {copied ? <DoneIcon /> : <ContentCopyOutlinedIcon />}
        </IconButton>
      </Box>
      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Button
          onClick={onDone}
          sx={{ minHeight: tokens.touch.min, color: "text.secondary" }}
        >
          Done
        </Button>
      </Box>
    </Box>
  );
}
