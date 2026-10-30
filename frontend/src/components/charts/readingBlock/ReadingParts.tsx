import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { Segment, SegmentTrack } from "@/components/canvas/SegmentedControl";
import { CloseIcon, ExpandIcon } from "@/lib/icons";
import { theme } from "@/lib/theme/theme";
import ReadingNumber from "./ReadingNumber";
import {
  type ReadingMeasurement,
  type ReadingView,
  readingNumberText,
} from "./readingView";

const { tokens } = theme;

export function GaugeName({
  gauges,
  gaugeId,
  onGauge,
}: {
  gauges: { id: number; name: string }[];
  gaugeId: number | null;
  onGauge: (id: number) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const current = gauges.find((g) => g.id === gaugeId) ?? gauges[0];
  const text = (
    <Typography
      component="span"
      noWrap
      sx={{ fontSize: "0.8125rem", fontWeight: 600 }}
    >
      {current?.name ?? ""}
    </Typography>
  );
  if (gauges.length < 2) {
    return (
      <Box sx={{ minWidth: 0, display: "flex", alignItems: "center" }}>
        {text}
      </Box>
    );
  }
  return (
    <>
      <ButtonBase
        aria-haspopup="listbox"
        aria-label={`Gauge: ${current?.name ?? ""}`}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{
          minHeight: tokens.touch.min,
          minWidth: 0,
          gap: 0.5,
          justifyContent: "flex-start",
        }}
      >
        {text}
        <ExpandIcon fontSize="small" />
      </ButtonBase>
      <Menu
        anchorEl={anchor}
        open={anchor != null}
        onClose={() => setAnchor(null)}
      >
        {gauges.map((g) => (
          <MenuItem
            key={g.id}
            selected={g.id === current?.id}
            onClick={() => {
              onGauge(g.id);
              setAnchor(null);
            }}
            sx={{ "&&": { minHeight: tokens.touch.min } }}
          >
            {g.name}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

export function Measurement({ types, type, onType }: ReadingMeasurement) {
  return (
    <SegmentTrack label="Reading">
      {types.map((t) => (
        <Segment
          key={t.type}
          compact
          active={t.type === type}
          onClick={() => onType(t.type)}
        >
          {t.label}
        </Segment>
      ))}
    </SegmentTrack>
  );
}

export function LevelSkeleton({ size }: { size: number }) {
  return (
    <Box
      data-testid="reading-skeleton"
      sx={{ display: "flex", alignItems: "baseline", gap: 1.25 }}
    >
      <Skeleton
        variant="rounded"
        animation="wave"
        width={size * 1.8}
        height={size}
        sx={{ borderRadius: `${tokens.radii.sm}px` }}
      />
      <Skeleton variant="text" animation="wave" width={56} height={20} />
    </Box>
  );
}

export function Level({ view, size }: { view: ReadingView; size: number }) {
  return (
    <Box data-testid="chart-reading" sx={{ minWidth: 0 }}>
      <Box
        sx={{ display: "flex", alignItems: "baseline", gap: 1.25, minWidth: 0 }}
      >
        <Box
          component="span"
          data-testid="reading-value"
          sx={{ whiteSpace: "nowrap" }}
        >
          <ReadingNumber
            text={readingNumberText(view.value)}
            size={size}
            stale={view.stale}
          />
          {view.value != null && (
            <Typography
              component="span"
              sx={{
                ml: 0.75,
                fontSize: "0.9375rem",
                color: tokens.onSurfaceVariant,
              }}
            >
              {view.unit}
            </Typography>
          )}
        </Box>
        {view.level ? (
          <Box
            component="span"
            data-testid="reading-level"
            sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}
          >
            <Box
              aria-hidden
              sx={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                bgcolor: view.level.color,
              }}
            />
            <Typography
              component="span"
              sx={{ fontSize: "0.875rem", fontWeight: 600 }}
            >
              {view.level.word}
            </Typography>
          </Box>
        ) : (
          <Box
            component="span"
            data-testid="reading-level-stale"
            sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}
          >
            {view.stale && (
              <Box
                aria-hidden
                sx={{
                  width: 10,
                  height: 10,
                  boxSizing: "border-box",
                  borderRadius: "50%",
                  border: `1.5px dashed ${tokens.onSurfaceVariant}`,
                }}
              />
            )}
            <Typography
              component="span"
              sx={{ fontSize: "0.875rem", color: tokens.onSurfaceVariant }}
            >
              {view.stale ? "No recent reading" : ""}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}

export function CloseGauge({ onDismiss }: { onDismiss: () => void }) {
  return (
    <IconButton
      aria-label="Close gauge chart"
      onClick={onDismiss}
      sx={{
        width: tokens.touch.min,
        height: tokens.touch.min,
        color: "text.secondary",
      }}
    >
      <CloseIcon sx={{ fontSize: 16 }} />
    </IconButton>
  );
}
