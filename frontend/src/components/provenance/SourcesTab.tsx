import BarChartOutlinedIcon from "@mui/icons-material/BarChartOutlined";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import PhotoOutlinedIcon from "@mui/icons-material/PhotoOutlined";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import VerticalAlignBottomIcon from "@mui/icons-material/VerticalAlignBottom";
import ViewAgendaOutlinedIcon from "@mui/icons-material/ViewAgendaOutlined";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { useState } from "react";
import EmptyState from "@/components/states/EmptyState";
import LoadingBox from "@/components/states/LoadingBox";
import type { GaugeSource, HistoryStep, WaterwaySources } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api/client";
import { formatDate } from "@/lib/format";
import { useWaterwayMedia } from "@/lib/hooks/useComments";
import { useWaterwayGauges } from "@/lib/hooks/useGauges";
import { licenseLink } from "@/lib/license";
import { alphas, fonts, labelSx, theme } from "@/lib/theme";
import HistoryHost from "./HistoryHost";
import { smallSx } from "./StepRow";
import { inOrder, ORIGIN_UNKNOWN, stepHeadline } from "./steps";
import type { HistoryTarget } from "./types";
import { useHistory, useSources } from "./useProvenance";

const { tokens } = theme;

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
          width: 36,
          height: 36,
          borderRadius: `${tokens.radii.sm}px`,
          bgcolor: `${tokens.primary}${alphas.wash}`,
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
        <ChevronRightIcon sx={{ fontSize: 20, color: "text.secondary" }} />
      ) : (
        <span />
      )}
    </>
  );
  const rowSx = {
    display: "grid",
    gridTemplateColumns: "36px minmax(0, 1fr) 20px",
    columnGap: 1.5,
    alignItems: "center",
    width: "100%",
    minHeight: 72,
    py: 1,
    pl: 2,
    pr: 1.5,
  } as const;
  return (
    <Box
      data-testid="source-row"
      sx={{
        "& + &": {
          borderTop: `1px solid ${tokens.outlineVariant}${alphas.hairline}`,
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

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
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
  target,
  sectionId,
  onOpen,
}: {
  target: HistoryTarget;
  sectionId: number | undefined;
  onOpen: () => void;
}) {
  const { data } = useHistory(target);
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
      icon={<VerticalAlignBottomIcon fontSize="small" />}
      kind={sectionId ? "Section" : "River"}
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
      icon={<ViewAgendaOutlinedIcon fontSize="small" />}
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
            icon={<BarChartOutlinedIcon fontSize="small" />}
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

/** Where a section's data comes from, one row per kind of data: its own
 * origin (the row opens its history), the river line, the features, the
 * gauge credit and the photos. Without a `sectionId` it describes the river. */
export default function SourcesTab({
  waterwayId,
  sectionId,
  name,
  subtitle,
}: {
  waterwayId: number;
  /** The section the tab belongs to; omitted it describes the river. */
  sectionId?: number;
  /** What the history panel is titled; defaults to "Section" or "River". */
  name?: string;
  /** The line under the history panel's title. */
  subtitle?: string;
}) {
  const sources = useSources(waterwayId);
  const gauges = useWaterwayGauges(waterwayId);
  const media = useWaterwayMedia(waterwayId);
  const [open, setOpen] = useState(false);
  const target: HistoryTarget =
    sectionId == null ? { waterwayId } : { waterwayId, sectionId };

  if (sources.isLoading) return <LoadingBox size={28} py={4} />;
  if (sources.error) {
    return (
      <EmptyState
        title={apiErrorMessage(
          sources.error,
          "The sources could not be loaded.",
        )}
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
    photos > 0 ? count(photos, "photo", "photos") : null,
    videos > 0 ? count(videos, "video", "videos") : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <HistoryHost
      target={open ? target : null}
      name={name ?? (sectionId == null ? "River" : "Section")}
      subtitle={subtitle}
      onClose={() => setOpen(false)}
    >
      <Box
        data-testid="sources"
        sx={{
          m: 1.5,
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
            fontFamily: fonts.label,
            color: "text.secondary",
            px: 2,
            pb: 1,
          }}
        >
          {sectionId == null
            ? "Where this data comes from."
            : "Where this section's data comes from."}
        </Typography>
        <OriginRow
          target={target}
          sectionId={sectionId}
          onOpen={() => setOpen(true)}
        />
        <SourceRow
          icon={<ShowChartIcon fontSize="small" />}
          kind="River line"
          who="OpenStreetMap"
          meta={<ExternalLink href={ODBL_URL}>ODbL</ExternalLink>}
        />
        {sources.data && <FeaturesRow data={sources.data} />}
        <GaugeRows sources={[...gaugeSources.values()]} />
        {mediaLine && (
          <SourceRow
            icon={<PhotoOutlinedIcon fontSize="small" />}
            kind="Photos"
            who={mediaLine}
            meta="Each credited in the gallery"
          />
        )}
      </Box>
    </HistoryHost>
  );
}
