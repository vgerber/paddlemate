import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import DetailCard from "@/components/DetailCard";
import FactRow from "@/components/FactRow";
import AllSizesTable from "@/components/materials/AllSizesTable";
import MaterialGallery from "@/components/materials/MaterialGallery";
import OverviewRows, {
  type OverviewRow,
} from "@/components/materials/OverviewRows";
import SourceList, { type SourceLink } from "@/components/materials/SourceList";
import SuggestChange from "@/components/materials/SuggestChange";
import SectionHeading from "@/components/SectionHeading";
import type { Material } from "@/lib/api";
import {
  availabilityChecked,
  availabilityValue,
  sourceHost,
} from "@/lib/materials/availability";
import {
  hasCommunitySource,
  sinceLabel,
  sourceLinks,
} from "@/lib/materials/facts";
import { type SpecRow, specRows } from "@/lib/materials/specRows";
import { CATEGORY_LABELS, disciplinesLabel } from "@/lib/materials/specs";
import { type Units, useUnits } from "@/lib/prefs/units";
import { formatDate, humanize, sentenceCase } from "@/lib/text/format";
import { theme } from "@/lib/theme/theme";

const { tokens } = theme;

/** "Checked 01 Nov 2026 · nrs.com", the host linking to the page the flag
 * was read from. */
function AvailabilityCaption({ material }: { material: Material }) {
  const checked = availabilityChecked(material);
  const source = material.availability_source;
  if (!checked && !source) return null;
  return (
    <span data-testid="availability-caption">
      {checked}
      {checked && source && " · "}
      {source && (
        <Link
          href={source}
          target="_blank"
          rel="noreferrer noopener"
          sx={{
            display: "inline-flex",
            alignItems: "center",
            minHeight: tokens.touch.min,
            color: "inherit",
          }}
        >
          {sourceHost(source)}
        </Link>
      )}
    </span>
  );
}

/** One wiki entry in full: what it is, every measurement it states, where
 * the numbers come from and who put them there. */
export default function MaterialDetailView({
  material,
  allSizes,
  onPickSize,
  onSuggest,
}: {
  material: Material;
  /** Every size of the model, when it has more than one. */
  allSizes: Material[];
  onSuggest: () => void;
  /** Opens another size of the model: the URL holds the entry id. */
  onPickSize: (id: number) => void;
}) {
  const [units] = useUnits();
  // Side by side from md: the second column opens level with the first.
  const sideBySide = useMediaQuery(theme.breakpoints.up("md"));
  const rows: OverviewRow[] = [
    {
      label: "Type",
      value: [
        CATEGORY_LABELS[material.category],
        disciplinesLabel(material.disciplines, material.category),
      ]
        .filter(Boolean)
        .join(" · "),
    },
  ];
  if (material.construction) {
    rows.push({
      label: "Construction",
      value: sentenceCase(humanize(material.construction)),
    });
  }
  if (sinceLabel(material)) {
    rows.push({ label: "Built", value: sinceLabel(material) });
  }
  rows.push({
    label: "Availability",
    value: availabilityValue(material),
    caption: <AvailabilityCaption material={material} />,
  });
  if (material.colors.length > 0) {
    rows.push({
      label: "Colours",
      value: material.colors.join(", "),
      testId: "material-colors",
    });
  }
  const links: SourceLink[] = [
    ...sourceLinks(material.sources).map((source) => ({
      url: source.url,
      title: source.host,
      detail: source.fields.join(", "),
    })),
    ...(material.product_url
      ? [{ url: material.product_url, title: "Manufacturer page" }]
      : []),
  ];

  return (
    // The header card's own 8 is the one gap above the first block.
    <Box sx={{ pt: { xs: 1, md: 0 }, pb: 3 }}>
      <MaterialGallery material={material} />
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { md: "repeat(2, minmax(0, 1fr))" },
          gridTemplateAreas: {
            md: '"overview sizes" "sources sizes"',
          },
          gridTemplateRows: { md: "auto 1fr" },
          columnGap: 1,
          alignItems: "start",
        }}
      >
        <Box sx={{ gridArea: { md: "overview" }, minWidth: 0 }}>
          <DetailCard heading="Overview" sx={{ py: 1 }} first>
            <OverviewRows rows={rows} />
            {material.description && (
              <Typography
                variant="body2"
                sx={{
                  mt: 1,
                  mb: 1,
                  whiteSpace: "pre-line",
                  overflowWrap: "anywhere",
                }}
              >
                {material.description}
              </Typography>
            )}
            {material.notes && (
              <Typography
                variant="body2"
                color="textSecondary"
                sx={{ mb: 1, whiteSpace: "pre-line", overflowWrap: "anywhere" }}
              >
                {material.notes}
              </Typography>
            )}
            {material.editor_note && (
              <Typography
                data-testid="editor-note"
                variant="body2"
                color="textSecondary"
                sx={{ mb: 1, whiteSpace: "pre-line", overflowWrap: "anywhere" }}
              >
                {`Editor note: ${material.editor_note}`}
              </Typography>
            )}
            <SuggestChange material={material} onSuggest={onSuggest} />
          </DetailCard>
        </Box>

        <Box sx={{ gridArea: { md: "sizes" }, minWidth: 0 }}>
          {allSizes.length > 0 ? (
            <>
              <Box sx={{ mx: { xs: `${tokens.phone.edge}px`, md: 0 } }}>
                <SectionHeading inset first={sideBySide}>
                  All sizes
                </SectionHeading>
              </Box>
              <AllSizesTable
                materials={allSizes}
                pickedId={material.id}
                onPick={onPickSize}
              />
            </>
          ) : (
            <SpecCards material={material} units={units} first={sideBySide} />
          )}
          {hasCommunitySource(material.sources) && (
            <Typography
              data-testid="community-source-note"
              variant="body2"
              color="textSecondary"
              sx={{ px: { xs: `${tokens.phone.edge}px`, md: 0 }, py: 1 }}
            >
              Some specs come from a community source and are not confirmed by
              the maker.
            </Typography>
          )}
        </Box>

        <Box sx={{ gridArea: { md: "sources" }, minWidth: 0 }}>
          <DetailCard heading="Sources">
            <SourceList links={links} />
            <Typography
              variant="body2"
              color="textSecondary"
              sx={{ py: 1, overflowWrap: "anywhere" }}
            >
              {material.created_by_username
                ? `Added by ${material.created_by_username} on ${formatDate(material.created_at)}`
                : `Added on ${formatDate(material.created_at)}`}
              {material.updated_by_username &&
                `. Last edited by ${material.updated_by_username} on ${formatDate(material.updated_at)}`}
            </Typography>
          </DetailCard>
        </Box>
      </Box>
    </Box>
  );
}

/** What one entry states, as a card per block (hull, cockpit, paddler; a
 * paddle's own specs): the list of a model with a single size. */
function SpecCards({
  material,
  units,
  first,
}: {
  material: Material;
  units: Units;
  first: boolean;
}) {
  const groups = new Map<string, SpecRow[]>();
  for (const row of specRows(material, units)) {
    groups.set(row.group, [...(groups.get(row.group) ?? []), row]);
  }
  if (groups.size === 0) return null;
  return (
    <Box data-testid="spec-cards">
      {[...groups].map(([group, rows], index) => (
        <DetailCard key={group} heading={group} first={first && index === 0}>
          <Box data-testid={group === "Paddle" ? "paddle-facts" : undefined}>
            {rows.map((row) => (
              <FactRow key={row.label} label={row.label} value={row.value} />
            ))}
          </Box>
        </DetailCard>
      ))}
    </Box>
  );
}
