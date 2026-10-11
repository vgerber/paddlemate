import HistoryIcon from "@mui/icons-material/History";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import EmptyState from "@/components/states/EmptyState";
import LoadingBox from "@/components/states/LoadingBox";
import TimelineRail from "@/components/TimelineRail";
import { apiErrorMessage } from "@/lib/api/client";
import { formatDate, timeAgo } from "@/lib/format";
import { fonts, labelSx, theme } from "@/lib/theme";
import {
  fieldLabel,
  inOrder,
  isGeometryChange,
  stepByline,
  stepHeadline,
} from "./steps";
import type { HistoryChange, HistoryStep, HistoryTarget } from "./types";
import { useHistory } from "./useProvenance";

const { tokens } = theme;

function ChangeLine({ change }: { change: HistoryChange }) {
  return (
    <Box
      data-testid="history-change"
      sx={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "baseline",
        columnGap: 1,
        mt: 0.5,
      }}
    >
      <Typography sx={{ ...labelSx, color: "text.secondary" }}>
        {fieldLabel(change.field)}
      </Typography>
      {isGeometryChange(change) ? (
        <Typography variant="body2">changed</Typography>
      ) : (
        <>
          {change.before !== null && (
            <Typography
              data-testid="change-before"
              variant="body2"
              sx={{
                color: "text.disabled",
                textDecoration: "line-through",
                overflowWrap: "anywhere",
              }}
            >
              {change.before}
            </Typography>
          )}
          <Typography
            variant="body2"
            sx={{ color: "text.disabled" }}
            aria-hidden
          >
            {change.before === null ? "added" : "to"}
          </Typography>
          {change.after !== null && (
            <Typography
              data-testid="change-after"
              variant="body2"
              sx={{ overflowWrap: "anywhere" }}
            >
              {change.after}
            </Typography>
          )}
        </>
      )}
    </Box>
  );
}

function SourceLicence({ step }: { step: HistoryStep }) {
  const source = step.source;
  if (!source?.license_name) return null;
  return (
    <Typography variant="body2" sx={{ color: "text.secondary" }}>
      Licence:{" "}
      {source.license_url ? (
        <Link
          href={source.license_url}
          target="_blank"
          rel="noopener noreferrer"
          sx={{
            display: "inline-flex",
            alignItems: "center",
            minHeight: tokens.touch.min,
          }}
        >
          {source.license_name}
        </Link>
      ) : (
        source.license_name
      )}
    </Typography>
  );
}

function Step({ step, isLast }: { step: HistoryStep; isLast: boolean }) {
  const byline = stepByline(step);
  return (
    <Box data-testid="history-step" sx={{ display: "flex", gap: 1.5 }}>
      <TimelineRail isLast={isLast} hollow={step.kind === "deleted"} />
      <Box sx={{ flex: 1, minWidth: 0, pb: isLast ? 0 : 2 }}>
        <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
          <Typography
            sx={{
              fontFamily: fonts.label,
              fontWeight: 600,
              fontSize: "0.9375rem",
              flex: 1,
              minWidth: 0,
              overflowWrap: "anywhere",
            }}
          >
            {stepHeadline(step)}
            {byline && (
              <Typography
                component="span"
                sx={{
                  fontWeight: 400,
                  color: "text.secondary",
                  fontSize: "inherit",
                }}
              >
                {", "}
                {byline}
              </Typography>
            )}
          </Typography>
          <Typography
            data-testid="history-when"
            title={formatDate(step.at)}
            variant="caption"
            sx={{ color: "text.disabled", flexShrink: 0 }}
          >
            {timeAgo(step.at)}
          </Typography>
        </Box>
        <SourceLicence step={step} />
        {step.changes.map((change) => (
          <ChangeLine key={change.field} change={change} />
        ))}
      </Box>
    </Box>
  );
}

/** The history of one entry on the timeline rail, oldest first: where it
 * came from at the top, the latest change at the foot. A deleted entry ends
 * on a hollow dot that says so. */
export default function HistoryTimeline({ target }: { target: HistoryTarget }) {
  const { data, isLoading, error } = useHistory(target);

  if (isLoading) return <LoadingBox size={28} py={4} />;
  if (error) {
    return (
      <EmptyState
        title={apiErrorMessage(error, "The history could not be loaded.")}
      />
    );
  }
  const steps = inOrder(data?.items ?? []);
  if (steps.length === 0) {
    return <EmptyState icon={<HistoryIcon />} title="No history yet." />;
  }
  return (
    <Box data-testid="history" sx={{ px: 2, py: 2 }}>
      {steps.map((step, i) => (
        <Step key={step.id} step={step} isLast={i === steps.length - 1} />
      ))}
    </Box>
  );
}
