import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import StatusChip from "@/components/proposals/StatusChip";
import TimelineRail, { type DotKind } from "@/components/TimelineRail";
import type { ProposalStatus } from "@/lib/api";
import { theme } from "@/lib/theme";
import type { BylinePart } from "./steps";

const { phone } = theme.tokens;

export const smallSx = { fontSize: "0.8125rem", lineHeight: "18px" } as const;

/** A by-line: the words grey, the names ink. `tail` adds the dated pieces. */
export function Byline({
  parts,
  tail,
  dateTestId,
}: {
  parts: BylinePart[];
  tail: string[];
  dateTestId?: string;
}) {
  const [date, ...rest] = tail;
  return (
    <Typography sx={{ ...smallSx, color: "text.secondary" }}>
      {parts.map((p) =>
        p.name ? (
          <Typography
            key={p.text}
            component="span"
            sx={{ ...smallSx, fontWeight: 500, color: "text.primary" }}
          >
            {p.text}
          </Typography>
        ) : (
          p.text
        ),
      )}
      {parts.length > 0 && " · "}
      <span data-testid={dateTestId}>{date}</span>
      {rest.map((t) => ` · ${t}`)}
    </Typography>
  );
}

/** One entry on the history rail: its dot and the content beside it. */
export default function StepRow({
  kind,
  first,
  last,
  title,
  lead,
  status,
  children,
  testId = "history-step",
}: {
  kind: DotKind;
  first: boolean;
  last: boolean;
  title: string;
  /** Above the title: the entry the step is about. */
  lead?: ReactNode;
  status?: ProposalStatus;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <Box
      data-testid={testId}
      sx={{
        display: "grid",
        // On a phone the rail is the 28 icon column and the text starts on
        // the 68 line, like a row with an icon.
        gridTemplateColumns: {
          xs: `${phone.icon}px minmax(0, 1fr)`,
          md: "32px minmax(0, 1fr)",
        },
        columnGap: { xs: `${phone.iconGap}px`, md: 1 },
        pl: { xs: `${phone.inner}px`, md: 1.5 },
        pr: 2,
      }}
    >
      <TimelineRail kind={kind} isFirst={first} isLast={last} />
      <Box sx={{ minWidth: 0, pt: 0.75, pb: 1.75 }}>
        {lead}
        <Typography
          sx={{
            fontWeight: 500,
            fontSize: "0.9375rem",
            lineHeight: "20px",
            overflowWrap: "anywhere",
          }}
        >
          {title}
          {status && (
            <Box component="span" sx={{ ml: 1, verticalAlign: "1px" }}>
              <StatusChip status={status} />
            </Box>
          )}
        </Typography>
        {children}
      </Box>
    </Box>
  );
}
