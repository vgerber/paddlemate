import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { humanize } from "@/lib/format";
import { CREATE_HIDDEN_KEYS, isDisplayable, shortValue } from "@/lib/proposals";
import { fonts } from "@/lib/theme";

/** Compact summary of a create proposal: clamped description plus the
 * displayable proposed fields as label-value pairs. */
export default function ProposalCreateSummary({
  proposed,
}: {
  proposed: Record<string, unknown>;
}) {
  return (
    <>
      {typeof proposed.description === "string" && proposed.description && (
        <Typography
          sx={{
            fontSize: "0.75rem",
            color: "text.secondary",
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {proposed.description}
        </Typography>
      )}

      <Box
        sx={{
          display: "flex",
          alignItems: "baseline",
          columnGap: 1.5,
          rowGap: 0.25,
          flexWrap: "wrap",
        }}
      >
        {Object.entries(proposed)
          .filter(
            ([k, v]) =>
              !CREATE_HIDDEN_KEYS.has(k) &&
              k !== "description" &&
              isDisplayable(v),
          )
          .map(([k, v]) => (
            <Typography
              key={k}
              sx={{ fontSize: "0.75rem", color: "text.secondary" }}
            >
              <Box
                component="span"
                sx={{
                  color: "text.disabled",
                  fontFamily: fonts.label,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  fontSize: "0.625rem",
                  mr: 0.5,
                }}
              >
                {humanize(k)}
              </Box>
              {shortValue(k, v)}
            </Typography>
          ))}
      </Box>
    </>
  );
}
