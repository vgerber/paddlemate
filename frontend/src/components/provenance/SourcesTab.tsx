import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import EmptyState from "@/components/states/EmptyState";
import LoadingBox from "@/components/states/LoadingBox";
import type { HistorySource, WaterwaySources } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api/client";
import { timeAgo } from "@/lib/format";
import { fonts, labelSx, theme } from "@/lib/theme";
import { useSources } from "./useProvenance";

const { tokens } = theme;

const linkSx = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: tokens.touch.min,
  maxWidth: "100%",
  overflowWrap: "anywhere",
} as const;

function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function SourceCard({
  source,
  entries,
}: {
  source: HistorySource;
  entries: number;
}) {
  return (
    <Box
      data-testid="source-card"
      sx={{
        p: 2,
        bgcolor: tokens.surface,
        borderRadius: `${tokens.radii.md}px`,
        boxShadow: tokens.elevation.e1,
      }}
    >
      <Typography
        component="h3"
        sx={{
          fontFamily: fonts.label,
          fontWeight: 600,
          fontSize: "0.9375rem",
          overflowWrap: "anywhere",
        }}
      >
        {source.name}
      </Typography>
      <Typography sx={labelSx}>
        {entries} {entries === 1 ? "entry" : "entries"}
      </Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", columnGap: 2, mt: 0.5 }}>
        {source.license_name &&
          (source.license_url ? (
            <Link
              href={source.license_url}
              target="_blank"
              rel="noopener noreferrer"
              sx={linkSx}
            >
              {source.license_name}
            </Link>
          ) : (
            <Typography
              variant="body2"
              sx={{ ...linkSx, color: "text.secondary" }}
            >
              {source.license_name}
            </Typography>
          ))}
        {source.website && (
          <Link
            href={source.website}
            target="_blank"
            rel="noopener noreferrer"
            sx={linkSx}
          >
            {host(source.website)}
          </Link>
        )}
      </Box>
    </Box>
  );
}

function Contributors({
  contributors,
}: {
  contributors: WaterwaySources["contributors"];
}) {
  return (
    <Box>
      <Typography sx={{ ...labelSx, px: 0.5, mb: 0.5 }}>
        Contributors
      </Typography>
      {contributors.map((c) => (
        <Box
          key={c.user.user_id}
          data-testid="contributor-row"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            minHeight: tokens.touch.row,
            px: 0.5,
            borderBottom: "1px solid",
            borderColor: `${tokens.outlineVariant}55`,
          }}
        >
          <Typography
            noWrap
            sx={{
              flex: 1,
              minWidth: 0,
              fontWeight: 600,
              fontSize: "0.9375rem",
            }}
          >
            {c.user.username}
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {c.steps} {c.steps === 1 ? "change" : "changes"}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.disabled" }}>
            {timeAgo(c.last_at)}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

/** Where a river's data comes from: each source as a card with its licence
 * and website, then the people who changed it. */
export default function SourcesTab({ waterwayId }: { waterwayId: number }) {
  const { data, isLoading, error } = useSources(waterwayId);

  if (isLoading) return <LoadingBox size={28} py={4} />;
  if (error) {
    return (
      <EmptyState
        title={apiErrorMessage(error, "The sources could not be loaded.")}
      />
    );
  }
  if (!data || (data.sources.length === 0 && data.contributors.length === 0)) {
    return <EmptyState title="No sources yet." />;
  }
  return (
    <Box
      data-testid="sources"
      sx={{ display: "flex", flexDirection: "column", gap: 2, p: 2 }}
    >
      <Box>
        <Typography sx={{ ...labelSx, px: 0.5 }}>Sources</Typography>
        <Typography
          variant="body2"
          sx={{ color: "text.disabled", px: 0.5, mb: 1 }}
        >
          Where this data comes from.
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          {data.sources.map((s) => (
            <SourceCard
              key={s.source.id}
              source={s.source}
              entries={s.entries}
            />
          ))}
        </Box>
      </Box>
      {data.contributors.length > 0 && (
        <Contributors contributors={data.contributors} />
      )}
    </Box>
  );
}
