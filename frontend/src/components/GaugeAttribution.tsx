import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import type { GaugeSource } from "@/lib/api";

/** One-line provider attribution for gauge data: source name (linked to the
 * provider's site when known) and its licensing terms. Shown wherever gauge
 * readings or gauges themselves are presented. */
export default function GaugeAttribution({
  source,
}: {
  source?: GaugeSource | null;
}) {
  if (!source) return null;
  const label = source.short_name ?? source.name;
  return (
    <Typography
      variant="caption"
      color="text.disabled"
      noWrap
      sx={{ display: "block", minWidth: 0 }}
    >
      Data:{" "}
      {source.website ? (
        <Link
          href={source.website}
          target="_blank"
          rel="noopener noreferrer"
          color="inherit"
          underline="hover"
        >
          {label}
        </Link>
      ) : (
        label
      )}
      {source.licensing_terms ? ` · ${source.licensing_terms}` : ""}
    </Typography>
  );
}
