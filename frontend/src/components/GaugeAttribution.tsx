import Link from "@mui/material/Link";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import type { GaugeSource } from "@/lib/api";
import { licenseLink } from "@/lib/license";

/** One-line provider attribution for gauge data: who published it and under
 * what terms. The provider's full statement runs to a few hundred characters,
 * so it stays in the tooltip and only the license name is rendered. */
export default function GaugeAttribution({
  source,
}: {
  source?: GaugeSource | null;
}) {
  // The verbatim-terms tooltip is a hover affordance; on touch devices it
  // fires on tap and fights the row tap, so it only exists where a pointer
  // can actually hover. The links carry the same information.
  const canHover = useMediaQuery("(hover: hover)");
  if (!source) return null;
  const label = source.short_name ?? source.name;
  const license = licenseLink(source);

  const line = (
    <Typography
      variant="caption"
      color="text.disabled"
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
      {license && (
        <>
          {" · "}
          {license.href ? (
            <Link
              href={license.href}
              target="_blank"
              rel="noopener noreferrer"
              color="inherit"
              underline="hover"
            >
              {license.label}
            </Link>
          ) : (
            license.label
          )}
        </>
      )}
    </Typography>
  );

  if (!source.licensing_terms || !canHover) return line;
  return (
    <Tooltip title={source.licensing_terms} placement="top">
      {line}
    </Tooltip>
  );
}

/** One attribution line per distinct source. A section can be calibrated
 * against gauges from several authorities, and each needs crediting. */
export function GaugeAttributions({
  sources,
}: {
  sources: (GaugeSource | null | undefined)[];
}) {
  const seen = new Map<string, GaugeSource>();
  for (const s of sources) {
    if (s && !seen.has(s.id)) seen.set(s.id, s);
  }
  if (seen.size === 0) return null;
  return (
    <>
      {[...seen.values()].map((s) => (
        <GaugeAttribution key={s.id} source={s} />
      ))}
    </>
  );
}
