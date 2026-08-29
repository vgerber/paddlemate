import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { Fragment } from "react";
import { humanize } from "@/lib/format";
import { diffObjects, HIDDEN_KEYS, shortValue } from "@/lib/proposals";
import { fonts } from "@/lib/theme";

/** Field / before / after grid for an update proposal. Renders nothing when
 * the visible fields are unchanged. */
export default function ProposalDiffTable({
  original,
  proposed,
}: {
  original: Record<string, unknown>;
  proposed: Record<string, unknown>;
}) {
  const diffs = diffObjects(original, proposed).filter(
    ({ key }) => !HIDDEN_KEYS.has(key),
  );
  if (diffs.length === 0) return null;

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "auto 1fr 1fr",
        gap: "2px 12px",
      }}
    >
      {["field", "before", "after"].map((h) => (
        <Typography
          key={h}
          variant="caption"
          sx={{
            color: "text.disabled",
            fontFamily: fonts.label,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontSize: "0.62rem",
          }}
        >
          {h}
        </Typography>
      ))}
      {diffs.map(({ key, from, to }) => (
        <Fragment key={key}>
          <Typography variant="caption">{humanize(key)}</Typography>
          <Typography
            variant="caption"
            sx={{ textDecoration: "line-through", color: "text.disabled" }}
          >
            {shortValue(key, from)}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.primary" }}>
            {shortValue(key, to)}
          </Typography>
        </Fragment>
      ))}
    </Box>
  );
}
