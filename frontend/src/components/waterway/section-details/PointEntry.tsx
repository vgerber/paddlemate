import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Collapse from "@mui/material/Collapse";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { fonts, theme } from "@/lib/theme";
import { CoordsInfo } from "./CoordsInfo";
import { ProposalDetail } from "./ProposalDetail";
import type { ComputedFeature } from "./types";
import { featureDesc, featureName, fmtKm } from "./utils";

const { tokens } = theme;

interface Props {
  item: ComputedFeature;
  isLast?: boolean;
  isActive?: boolean;
  onClick?: () => void;
}

export function PointEntry({
  item,
  isLast = false,
  isActive = false,
  onClick,
}: Props) {
  const name = featureName(item.feature);
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
          pt: "3px",
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
          {!isProposal
            ? <CoordsInfo coords={item.coords} />
            : item.proposal && (
                <ProposalDetail
                  proposal={item.proposal}
                  coords={item.coords}
                  featureType={item.feature.feature_type}
                />
              )
          }
        </Collapse>
      </Box>
    </ButtonBase>
  );
}
