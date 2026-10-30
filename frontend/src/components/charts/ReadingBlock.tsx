import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import PeriodMenu, { type PeriodControl } from "@/components/charts/PeriodMenu";
import { theme } from "@/lib/theme/theme";
import {
  CloseGauge,
  GaugeName,
  Level,
  LevelSkeleton,
  Measurement,
} from "./readingBlock/ReadingParts";
import {
  type ReadingMeasurement,
  type ReadingView,
  readingTimeLine,
} from "./readingBlock/readingView";

export type { ReadingView };

const { tokens } = theme;

interface ReadingBlockProps {
  gauges: { id: number; name: string }[];
  gaugeId: number | null;
  onGauge: (id: number) => void;
  view: ReadingView | null;
  /** The Level or Flow choice; only for a gauge that measures both. */
  measurement?: ReadingMeasurement;
  /** Closes a picked gauge's chart. */
  onDismiss?: () => void;
  /** The period control, when it lives in the block (else the caller
   * places it). */
  period?: PeriodControl;
  /** Side padding in px: the text line the block keeps. */
  inset?: number;
  /** The reading's size: larger on the rail, where the block is tall. */
  numberSize?: number;
  /** The phone card's head: the reading first, then its time with the
   * Level | Flow choice at the right; the gauge is named only when it can
   * be picked; the close mark floats top right. */
  phone?: boolean;
}

function PhoneHead({
  gauges,
  gaugeId,
  onGauge,
  view,
  measurement,
  onDismiss,
  inset,
  numberSize,
}: Omit<ReadingBlockProps, "phone" | "period" | "inset" | "numberSize"> & {
  inset: number;
  numberSize: number;
}) {
  return (
    <Box
      data-testid="reading-block"
      sx={{ position: "relative", px: `${inset}px`, pt: 1.5, minWidth: 0 }}
    >
      {onDismiss && (
        <Box sx={{ position: "absolute", top: 0, right: 0 }}>
          <CloseGauge onDismiss={onDismiss} />
        </Box>
      )}
      {gauges.length > 1 && (
        <GaugeName gauges={gauges} gaugeId={gaugeId} onGauge={onGauge} />
      )}
      {view ? (
        <Level view={view} size={numberSize} />
      ) : (
        <LevelSkeleton size={numberSize} />
      )}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 1,
          minHeight: 24,
          mt: 0.5,
        }}
      >
        {view?.time && (
          <Typography
            data-testid="reading-time"
            sx={{
              fontSize: "0.75rem",
              color: tokens.onSurfaceVariant,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {readingTimeLine(view)}
          </Typography>
        )}
        {measurement && measurement.types.length > 1 && (
          <Measurement {...measurement} />
        )}
      </Box>
    </Box>
  );
}

/** The chart's reading: which gauge and when, the level, the period. It is
 * the foot of the detail card on a wide screen and the first block of the
 * card below that. */
export default function ReadingBlock({
  gauges,
  gaugeId,
  onGauge,
  view,
  measurement,
  onDismiss,
  period,
  inset = 24,
  numberSize = 36,
  phone = false,
}: ReadingBlockProps) {
  if (phone) {
    return (
      <PhoneHead
        gauges={gauges}
        gaugeId={gaugeId}
        onGauge={onGauge}
        view={view}
        measurement={measurement}
        onDismiss={onDismiss}
        inset={inset}
        numberSize={numberSize}
      />
    );
  }
  return (
    <Box
      data-testid="reading-block"
      sx={{
        height: "100%",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        px: `${inset}px`,
        pt: 1,
        pb: 2.5,
        minWidth: 0,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 1,
          // The trailing boxes end 12px from the edge.
          mr: -1.5,
        }}
      >
        <Box sx={{ minWidth: 0, pt: 0.5 }}>
          <GaugeName gauges={gauges} gaugeId={gaugeId} onGauge={onGauge} />
          {view?.time && (
            <Typography
              data-testid="reading-time"
              sx={{
                fontSize: "0.75rem",
                color: tokens.onSurfaceVariant,
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
              }}
            >
              {readingTimeLine(view)}
            </Typography>
          )}
        </Box>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            flexShrink: 0,
          }}
        >
          {period && <PeriodMenu {...period} />}
          {onDismiss && <CloseGauge onDismiss={onDismiss} />}
        </Box>
      </Box>
      {/* Room for an outlook line once there are forecasts; the number below
          keeps its place. */}
      <Box sx={{ flex: 1, minHeight: 8 }} />
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 1,
        }}
      >
        {view ? (
          <Level view={view} size={numberSize} />
        ) : (
          <LevelSkeleton size={numberSize} />
        )}
        {measurement && measurement.types.length > 1 && (
          <Measurement {...measurement} />
        )}
      </Box>
    </Box>
  );
}
