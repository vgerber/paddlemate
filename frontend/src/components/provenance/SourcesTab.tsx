import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import ErrorState from "@/components/states/ErrorState";
import LoadingBox from "@/components/states/LoadingBox";
import { withAlpha } from "@/lib/alpha";
import type {
  Feature,
  GaugeSource,
  HistoryStep,
  SectionWithFeatures,
  WaterwaySources,
} from "@/lib/api";
import { formatDate, plural } from "@/lib/format";
import { useWaterwayMedia } from "@/lib/hooks/useComments";
import { useWaterwayGauges } from "@/lib/hooks/useGauges";
import { useHistory, useSources } from "@/lib/hooks/useProvenance";
import { useSession } from "@/lib/hooks/useSession";
import {
  AlignBottomIcon,
  BackIcon,
  BarChartIcon,
  ChevronRightIcon,
  EditIcon,
  LineChartIcon,
  PhotoIcon,
  StackIcon,
} from "@/lib/icons";
import { licenseLink } from "@/lib/license";
import { fonts, labelSx, theme } from "@/lib/theme";
import EditsTimeline, { type EditsFilter, useEntries } from "./EditsTimeline";
import { smallSx } from "./StepRow";
import { inOrder, ORIGIN_UNKNOWN, stepHeadline } from "./steps";

const { tokens } = theme;
const { phone } = tokens;

const ODBL_URL = "https://opendatacommons.org/licenses/odbl/";

const textLinkSx = {
  color: tokens.primary,
  fontWeight: 500,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  // The line is 13px type; the hit area is drawn around it.
  minHeight: tokens.touch.min,
  my: "-13px",
} as const;

function SourceRow({
  icon,
  kind,
  who,
  meta,
  onOpen,
}: {
  icon: ReactNode;
  kind: string;
  who: string;
  meta?: ReactNode;
  onOpen?: () => void;
}) {
  const body = (
    <>
      <Box
        sx={{
          width: { xs: phone.icon, md: 36 },
          height: { xs: phone.icon, md: 36 },
          borderRadius: `${tokens.radii.sm}px`,
          bgcolor: withAlpha(tokens.primary, "wash"),
          color: tokens.primary,
          display: "grid",
          placeItems: "center",
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0, textAlign: "left" }}>
        <Typography
          sx={{ ...smallSx, color: "text.secondary", display: "block" }}
        >
          {kind}
        </Typography>
        <Typography
          sx={{
            fontWeight: 500,
            fontSize: "0.9375rem",
            lineHeight: "20px",
            overflowWrap: "anywhere",
          }}
        >
          {who}
        </Typography>
        {meta && (
          <Typography
            component="div"
            sx={{ ...smallSx, color: "text.secondary" }}
          >
            {meta}
          </Typography>
        )}
      </Box>
      {onOpen ? (
        <ChevronRightIcon
          sx={{ fontSize: { xs: 24, md: 20 }, color: "text.secondary" }}
        />
      ) : (
        <span />
      )}
    </>
  );
  const rowSx = {
    display: "grid",
    // Phone: the 28 icon column, names on the 68 line, and the chevron in
    // the 44 trailing slot that hangs past the padding (a spacer when the
    // row opens nothing), so values end on one line.
    gridTemplateColumns: {
      xs: `${phone.icon}px minmax(0, 1fr) ${tokens.touch.min}px`,
      md: "36px minmax(0, 1fr) 20px",
    },
    columnGap: { xs: `${phone.iconGap}px`, md: 1.5 },
    justifyItems: "stretch",
    alignItems: "center",
    width: "100%",
    minHeight: 72,
    py: 1,
    pl: 2,
    pr: { xs: `${phone.inner - phone.trailInset}px`, md: 1.5 },
    "& > :last-child": { justifySelf: "center" },
  } as const;
  return (
    <Box
      data-testid="source-row"
      sx={{
        "& + &": {
          borderTop: `1px solid ${withAlpha(tokens.outlineVariant, "hairline")}`,
        },
      }}
    >
      {onOpen ? (
        <ButtonBase onClick={onOpen} sx={rowSx}>
          {body}
        </ButtonBase>
      ) : (
        <Box sx={rowSx}>{body}</Box>
      )}
    </Box>
  );
}

function ExternalLink({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} target="_blank" rel="noopener noreferrer" sx={textLinkSx}>
      {children}
    </Link>
  );
}

function times(n: number): string {
  if (n === 1) return "once";
  if (n === 2) return "twice";
  return `${n} times`;
}

/** Where the entry itself came from, read off its oldest step. */
function originLine(first: HistoryStep | undefined): string {
  if (!first) return ORIGIN_UNKNOWN;
  if (first.kind === "created" && first.actor) {
    return `Added by ${first.actor.username}`;
  }
  return first.kind === "imported" ? stepHeadline(first) : ORIGIN_UNKNOWN;
}

function OriginRow({
  section,
  onOpen,
}: {
  section: SectionWithFeatures;
  onOpen: () => void;
}) {
  const { data } = useHistory({
    waterwayId: section.waterway_id,
    sectionId: section.id,
  });
  const steps = inOrder(data?.items ?? []);
  const first = steps[0];
  const since = steps.length - 1;
  const meta = first
    ? [formatDate(first.at), since > 0 ? `changed ${times(since)} since` : null]
        .filter(Boolean)
        .join(" · ")
    : undefined;
  return (
    <SourceRow
      icon={<AlignBottomIcon fontSize="small" />}
      kind="Section"
      who={originLine(first)}
      meta={meta}
      onOpen={steps.length > 0 ? onOpen : undefined}
    />
  );
}

function FeaturesRow({ data }: { data: WaterwaySources }) {
  const from = data.sources.map(
    (s) => `${s.entries} from ${s.source.short_name || s.source.name}`,
  );
  const last = [...data.contributors].sort(
    (a, b) => Date.parse(b.last_at) - Date.parse(a.last_at),
  )[0];
  if (from.length === 0 && !last) return null;
  return (
    <SourceRow
      icon={<StackIcon fontSize="small" />}
      kind="Features"
      who={from.join(", ") || "Added by paddlers"}
      meta={
        last
          ? `Last change ${formatDate(last.last_at)} by ${last.user.username}`
          : undefined
      }
    />
  );
}

function GaugeRows({ sources }: { sources: GaugeSource[] }) {
  return (
    <>
      {sources.map((source) => {
        const license = licenseLink(source);
        return (
          <SourceRow
            key={source.id}
            icon={<BarChartIcon fontSize="small" />}
            kind="Gauge"
            who={`Data: ${source.short_name ?? source.name}`}
            meta={
              license &&
              (license.href ? (
                <ExternalLink href={license.href}>{license.label}</ExternalLink>
              ) : (
                license.label
              ))
            }
          />
        );
      })}
    </>
  );
}

function FilterHeader({
  section,
  filter,
  onBack,
  onEdit,
}: {
  section: SectionWithFeatures;
  filter: NonNullable<EditsFilter>;
  onBack: () => void;
  onEdit?: (feature: Feature) => void;
}) {
  const entry = useEntries(section).find(
    (e) => e.kind === filter.kind && e.id === filter.id,
  );
  const feature =
    filter.kind === "feature"
      ? section.features.find((f) => f.id === filter.id)
      : undefined;
  return (
    <Box
      data-testid="edits-header"
      sx={{
        m: { xs: 1.5, md: 0 },
        mb: 0,
        pl: 0.5,
        pr: 1.5,
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        bgcolor: tokens.surface,
        borderRadius: `${tokens.radii.md}px`,
        boxShadow: tokens.elevation.e1,
        minHeight: 64,
      }}
    >
      <IconButton
        aria-label="All edits"
        onClick={onBack}
        sx={{ width: tokens.touch.min, height: tokens.touch.min }}
      >
        <BackIcon fontSize="small" />
      </IconButton>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{
            fontWeight: 600,
            fontSize: "1rem",
            lineHeight: "22px",
            overflowWrap: "anywhere",
          }}
        >
          {entry?.name}
        </Typography>
        <Typography sx={{ ...smallSx, color: "text.secondary" }}>
          {entry?.label}
        </Typography>
      </Box>
      {feature && onEdit && (
        <Button
          variant="outlined"
          color="inherit"
          startIcon={<EditIcon fontSize="small" />}
          onClick={() => onEdit(feature)}
          sx={{ minHeight: tokens.touch.min, flexShrink: 0 }}
        >
          Edit feature
        </Button>
      )}
    </Box>
  );
}

/** Where a section's data comes from and every edit made to it. Unfiltered:
 * one row per kind of data (the section's origin, the river line, the
 * features, the gauge credit, the photos), then one timeline of the edits to
 * the section and all its features. Filtered to one entry: that entry's
 * history under a header with its edit action. */
export default function SourcesTab({
  section,
  filter,
  onFilterChange,
  onEditFeature,
}: {
  section: SectionWithFeatures;
  filter: EditsFilter;
  onFilterChange: (filter: EditsFilter) => void;
  /** Opens the feature's edit panel; omitted where the page offers none. */
  onEditFeature?: (feature: Feature) => void;
}) {
  const waterwayId = section.waterway_id;
  const sources = useSources(waterwayId, section.id);
  const gauges = useWaterwayGauges(waterwayId);
  const media = useWaterwayMedia(waterwayId);
  const { isAuthenticated } = useSession();
  const timeline = (
    <EditsTimeline
      section={section}
      filter={filter}
      onOpenEntry={(entry) => {
        if (entry.id != null)
          onFilterChange({ kind: entry.kind, id: entry.id });
      }}
    />
  );

  if (filter) {
    return (
      <>
        <FilterHeader
          section={section}
          filter={filter}
          onBack={() => onFilterChange(null)}
          onEdit={isAuthenticated ? onEditFeature : undefined}
        />
        {timeline}
      </>
    );
  }
  if (sources.isLoading) return <LoadingBox size={28} py={4} />;
  if (sources.error) {
    return (
      <ErrorState
        error={sources.error}
        fallback="The sources could not be loaded."
        onRetry={() => sources.refetch()}
      />
    );
  }
  const gaugeSources = new Map<string, GaugeSource>();
  for (const g of gauges.data ?? []) {
    if (g.source) gaugeSources.set(g.source.id, g.source);
  }
  const photos = (media.data ?? []).filter((m) => m.kind === "photo").length;
  const videos = (media.data ?? []).filter((m) => m.kind === "video").length;
  const mediaLine = [
    photos > 0 ? plural(photos, "photo") : null,
    videos > 0 ? plural(videos, "video") : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <Box
        data-testid="sources"
        sx={{
          m: { xs: 1.5, md: 0 },
          bgcolor: tokens.surface,
          borderRadius: `${tokens.radii.md}px`,
          boxShadow: tokens.elevation.e1,
          overflow: "hidden",
        }}
      >
        <Typography sx={{ ...labelSx, px: 2, pt: 1.75, pb: 0.5 }}>
          Sources
        </Typography>
        <Typography
          sx={{
            ...smallSx,
            fontFamily: fonts.body,
            color: "text.secondary",
            px: 2,
            pb: 1,
          }}
        >
          Where this section's data comes from.
        </Typography>
        <OriginRow
          section={section}
          onOpen={() => onFilterChange({ kind: "section", id: section.id })}
        />
        <SourceRow
          icon={<LineChartIcon fontSize="small" />}
          kind="River line"
          who="OpenStreetMap"
          meta={<ExternalLink href={ODBL_URL}>ODbL</ExternalLink>}
        />
        {sources.data && <FeaturesRow data={sources.data} />}
        <GaugeRows sources={[...gaugeSources.values()]} />
        {mediaLine && (
          <SourceRow
            icon={<PhotoIcon fontSize="small" />}
            kind="Photos"
            who={mediaLine}
            meta="Each credited in the gallery"
          />
        )}
      </Box>
      {timeline}
    </>
  );
}
