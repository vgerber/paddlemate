import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { fonts, theme } from "@/lib/theme";
import { CoordsInfo } from "./CoordsInfo";
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

  return (
    <ButtonBase
      component="div"
      disableRipple
      onClick={onClick}
      sx={{
        display: "flex",
        gap: "10px",
        cursor: onClick ? "pointer" : "default",
        background: isActive ? `${tokens.primary}0d` : "transparent",
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
          sx={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            bgcolor: tokens.primary,
            flexShrink: 0,
            boxShadow: `0 0 10px ${tokens.primary}99, 0 0 4px ${tokens.primary}`,
            mb: "4px",
          }}
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
              color: tokens.primary,
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
              mt: "4px",
              lineHeight: 1.5,
              display: "block",
            }}
          >
            {desc}
          </Typography>
        )}
        {isActive && <CoordsInfo coords={item.coords} />}
      </Box>
    </ButtonBase>
  );
}
