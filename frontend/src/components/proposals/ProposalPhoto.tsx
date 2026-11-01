import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import { useNavigate } from "@tanstack/react-router";
import Fact from "@/components/Fact";
import type { Proposal } from "@/lib/api";
import { useMaterialPhotoPreview } from "@/lib/hooks/useMaterials";
import { theme } from "@/lib/theme/theme";

const { tokens } = theme;

/** A photo proposal: the picture waiting for review (loaded with the
 * reader's token, since the file is not public yet), its credit and a link
 * to the entry. Once decided the file is either live on the entry or gone. */
export default function ProposalPhoto({ proposal }: { proposal: Proposal }) {
  const data = proposal.proposed_data as Record<string, unknown>;
  const imageId = typeof data.image_id === "number" ? data.image_id : null;
  const credit = typeof data.credit === "string" ? data.credit : "";
  const navigate = useNavigate();
  const pending = proposal.status === "pending";
  const { url, failed } = useMaterialPhotoPreview(
    pending ? (proposal.entity_id ?? null) : null,
    pending ? imageId : null,
  );
  return (
    <Box
      data-testid="proposal-photo"
      sx={{ display: "flex", flexDirection: "column", gap: 2 }}
    >
      {pending && (
        <Box
          sx={{
            aspectRatio: "4 / 3",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: tokens.surfaceHigh,
            borderRadius: `${tokens.radii.md}px`,
            overflow: "hidden",
          }}
        >
          {url ? (
            <Box
              component="img"
              src={url}
              alt="The photo under review"
              data-testid="proposal-photo-image"
              sx={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          ) : failed ? (
            <Typography variant="body2" color="textSecondary">
              The photo cannot be shown.
            </Typography>
          ) : (
            <CircularProgress size={28} aria-label="Loading photo" />
          )}
        </Box>
      )}
      <Fact label="Credit" value={credit || "-"} />
      {proposal.entity_id != null && (
        <Button
          href={`/materials/${proposal.entity_id}`}
          onClick={(event) => {
            event.preventDefault();
            navigate({
              to: "/materials/$materialId",
              params: { materialId: String(proposal.entity_id) },
              search: { edit: false },
            });
          }}
          sx={{ alignSelf: "flex-start", minHeight: tokens.touch.min }}
        >
          Open the entry
        </Button>
      )}
    </Box>
  );
}
