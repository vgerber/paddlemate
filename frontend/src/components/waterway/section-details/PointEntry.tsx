import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Collapse from "@mui/material/Collapse";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { fonts, theme } from "@/lib/theme";
import { CoordsInfo } from "./CoordsInfo";
import { ProposalDetail } from "./ProposalDetail";
import type { ComputedFeature } from "./types";
import { featureDesc, featureName, featureTypeLabel, fmtKm } from "./utils";

const { tokens } = theme;

/** Delete action for the coords row, matching its copy/open buttons. */
export function DeleteFeatureButton({ onDelete }: { onDelete: () => void }) {
  return (
    <IconButton
      size="small"
      title="Delete feature"
      onClick={(e: React.MouseEvent) => {
        e.stopPropagation();
        onDelete();
      }}
      sx={{ color: tokens.error }}
    >
      <DeleteOutlinedIcon fontSize="small" />
    </IconButton>
  );
}

/** Marker behind a feature name when a delete proposal is pending. */
export function PendingDeleteMarker() {
  return (
    <DeleteOutlinedIcon
      titleAccess="Deletion proposed"
      sx={{ fontSize: 13, color: tokens.error, opacity: 0.75, flexShrink: 0 }}
    />
  );
}

interface Props {
  item: ComputedFeature;
  isLast?: boolean;
  isActive?: boolean;
  onClick?: () => void;
  /** Shown in the expanded area; omitted for proposals or signed-out users. */
  onDelete?: () => void;
  /** True when a delete proposal is pending for this feature. */
  pendingDelete?: boolean;
}

export function PointEntry({
  item,
  isLast = false,
  isActive = false,
  onClick,
  onDelete,
  pendingDelete = false,
}: Props) {
  const name = featureName(item.feature);
  const typeLabel = featureTypeLabel(item.feature);
  const desc = featureDesc(item.feature);
  const isProposal = !!item.proposal;

  return (
    <ButtonBase
      component="div"
      disableRipple
      onClick={onClick}
      sx={{
        display: "flex",
        gap: "10px",
        cursor: onClick ? "pointer" : "default",
        background: isActive
          ? isProposal
            ? `${tokens.onSurfaceVariant}0a`
            : `${tokens.primary}0d`
          : "transparent",
        width: "100%",
        alignItems: "flex-start",
        textAlign: "left",
        px: "6px",
        borderRadius: "8px",
      }}
    >
      <Stack
        direction="column"
        sx={{
          width: 16,
          flexShrink: 0,
          // Centers the 12px dot on the first text line (text pt 4px +
          // ~8px half line height - 6px half dot).
          pt: "6px",
          alignItems: "center",
          alignSelf: "stretch",
        }}
      >
        <Box
          sx={
            isProposal
              ? {
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  border: `1.5px solid ${tokens.onSurfaceVariant}`,
                  opacity: 0.45,
                  flexShrink: 0,
                  mb: "4px",
                }
              : {
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  bgcolor: tokens.primary,
                  flexShrink: 0,
                  boxShadow: `0 0 10px ${tokens.primary}99, 0 0 4px ${tokens.primary}`,
                  mb: "4px",
                }
          }
        />
        {!isLast && (
          <Box
            sx={{
              width: 2,
              flex: 1,
              minHeight: 20,
              bgcolor: tokens.outline,
              opacity: 0.45,
              mt: "4px",
              mb: "4px",
            }}
          />
        )}
      </Stack>

      <Box
        sx={{
          flex: 1,
          pt: "4px",
          pb: isLast ? "8px" : "20px",
          minWidth: 0,
          minHeight: 28,
        }}
      >
        <Stack
          direction="row"
          sx={{
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "4px",
          }}
        >
          <Stack
            direction="row"
            sx={{ alignItems: "center", gap: 0.5, minWidth: 0 }}
          >
            <Typography
              component="span"
              sx={{
                fontFamily: fonts.label,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                color: isProposal ? tokens.onSurfaceVariant : tokens.primary,
                opacity: isProposal ? 0.6 : 1,
                lineHeight: 1.25,
              }}
            >
              {name}
            </Typography>
            {pendingDelete && <PendingDeleteMarker />}
          </Stack>
          <Typography
            component="span"
            sx={{
              fontFamily: fonts.mono,
              fontSize: 12,
              color: tokens.outline,
              flexShrink: 0,
              lineHeight: 1.5,
              opacity: isProposal ? 0.5 : 1,
            }}
          >
            {fmtKm(item.distM)}
          </Typography>
        </Stack>

        {typeLabel && (
          <Typography
            sx={{
              fontFamily: fonts.label,
              fontSize: "0.62rem",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: tokens.outline,
              opacity: isProposal ? 0.6 : 1,
              lineHeight: 1.4,
            }}
          >
            {typeLabel}
          </Typography>
        )}

        {desc && (
          <Typography
            sx={{
              fontFamily: fonts.body,
              fontSize: 12,
              color: tokens.onSurfaceVariant,
              opacity: isProposal ? 0.65 : 1,
              mt: "4px",
              lineHeight: 1.5,
              display: "block",
            }}
          >
            {desc}
          </Typography>
        )}

        <Collapse in={isActive} timeout={200} unmountOnExit>
          {!isProposal ? (
            <CoordsInfo
              coords={item.coords}
              actions={onDelete && <DeleteFeatureButton onDelete={onDelete} />}
            />
          ) : (
            item.proposal && (
              <ProposalDetail
                proposal={item.proposal}
                coords={item.coords}
                featureType={item.feature.feature_type}
              />
            )
          )}
        </Collapse>
      </Box>
    </ButtonBase>
  );
}
