import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Collapse from "@mui/material/Collapse";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { fonts, theme } from "@/lib/theme";
import { CoordsInfo } from "./CoordsInfo";
import { PointEntry } from "./PointEntry";
import { ProposalDetail } from "./ProposalDetail";
import type { ComputedFeature } from "./types";
import { featureDesc, featureName, fmtKm } from "./utils";

const { tokens } = theme;

interface Props {
  item: ComputedFeature;
  nested: ComputedFeature[];
  isLast?: boolean;
  activeId?: number | null;
  onItemClick?: (item: ComputedFeature) => void;
}

/**
 * Renders a zone as a vertical bracket: a ↓ chevron at the start row and a ↑
 * chevron at the end row, connected by a faint rail line.
 */
export function ZoneEntry({
  item,
  nested,
  isLast = false,
  activeId,
  onItemClick,
}: Props) {
  const name = featureName(item.feature);
  const desc = featureDesc(item.feature);
  const isActive = activeId === item.feature.id;
  const isProposal = !!item.proposal;

  const zoneColor = isProposal ? tokens.onSurfaceVariant : tokens.secondary;

  return (
    <Box sx={{ position: "relative", mb: isLast ? "4px" : 2, opacity: isProposal ? 0.6 : 1 }}>
      {/* Zone start row */}
      <ButtonBase
        component="div"
        disableRipple
        onClick={() => onItemClick?.(item)}
        sx={{
          display: "flex",
          gap: "10px",
          alignItems: "flex-start",
          pb: 2,
          cursor: onItemClick ? "pointer" : "default",
          background: isActive
            ? isProposal
              ? `${tokens.onSurfaceVariant}0a`
              : `${tokens.secondary}0d`
            : "transparent",
          width: "100%",
          textAlign: "left",
          px: "6px",
          borderRadius: "4px",
        }}
      >
        <Box
          sx={{
            width: 16,
            flexShrink: 0,
            display: "flex",
            justifyContent: "center",
            pt: "3px",
          }}
        >
          <svg
            aria-hidden="true"
            width="12"
            height="12"
            viewBox="0 0 10 10"
            fill="none"
          >
            <path
              d="M2 3.5 L5 6.5 L8 3.5"
              stroke={zoneColor}
              strokeWidth={isProposal ? "1" : "1.5"}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={isProposal ? "2 1.5" : undefined}
            />
          </svg>
        </Box>
        <Stack direction="column" sx={{ flex: 1, pt: "4px" }}>
          <Stack
            direction="row"
            sx={{
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 1,
            }}
          >
            <Typography
              component="span"
              sx={{
                fontFamily: fonts.label,
                fontSize: 13,
                fontWeight: 900,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: zoneColor,
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
                lineHeight: 1.4,
              }}
            >
              {fmtKm(item.startM)}
            </Typography>
          </Stack>
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
        </Stack>
      </ButtonBase>

      {desc && (
        <Typography
          sx={{
            fontFamily: fonts.body,
            fontSize: 12,
            color: tokens.onSurfaceVariant,
            mt: "-8px",
            mb: "8px",
            ml: "26px",
            lineHeight: 1.5,
            display: "block",
          }}
        >
          {desc}
        </Typography>
      )}

      {nested.map((child, idx) => (
        <PointEntry
          key={child.feature.id}
          item={child}
          isLast={idx === nested.length - 1}
          isActive={activeId === child.feature.id}
          onClick={() => onItemClick?.(child)}
        />
      ))}

      {/* Zone end row */}
      <Stack direction="row" sx={{ gap: "10px", alignItems: "center", px: "6px" }}>
        <Box
          sx={{
            width: 16,
            flexShrink: 0,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <svg
            aria-hidden="true"
            width="12"
            height="12"
            viewBox="0 0 10 10"
            fill="none"
          >
            <path
              d="M2 6.5 L5 3.5 L8 6.5"
              stroke={zoneColor}
              strokeWidth={isProposal ? "1" : "1.5"}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={isProposal ? "2 1.5" : undefined}
            />
          </svg>
        </Box>
        <Stack direction="row" sx={{ flex: 1, justifyContent: "flex-end" }}>
          <Typography
            component="span"
            sx={{
              fontFamily: fonts.mono,
              fontSize: 12,
              color: tokens.outline,
            }}
          >
            {fmtKm(item.endM)}
          </Typography>
        </Stack>
      </Stack>
    </Box>
  );
}

