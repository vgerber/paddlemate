import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import DetailCard from "@/components/DetailCard";
import FactRow from "@/components/FactRow";
import AllSizesTable from "@/components/materials/AllSizesTable";
import MaterialGallery from "@/components/materials/MaterialGallery";
import OverviewRows, {
  type OverviewRow,
} from "@/components/materials/OverviewRows";
import SourceList, { type SourceLink } from "@/components/materials/SourceList";
import SuggestChange from "@/components/materials/SuggestChange";
import RowMenu, { type RowAction } from "@/components/RowMenu";
import SectionHeading from "@/components/SectionHeading";
import type { Material } from "@/lib/api";
import { useMaterialComparison } from "@/lib/hooks/useMaterials";
import { DeleteIcon, EditIcon, PhotoIcon } from "@/lib/icons";
import {
  availabilityChecked,
  availabilityValue,
  sourceHost,
} from "@/lib/materials/availability";
import { modelSizes, sinceLabel, sourceLinks } from "@/lib/materials/facts";
import { type SpecRow, specRows } from "@/lib/materials/specRows";
import { CATEGORY_LABELS, disciplinesLabel } from "@/lib/materials/specs";
import { type Units, useUnits } from "@/lib/prefs/units";
import { formatDate, humanize, sentenceCase } from "@/lib/text/format";
import { theme } from "@/lib/theme/theme";

const { tokens } = theme;

/** The header menu of an entry: correcting is open to every signed-in
 * paddler, removing is the admin's. */
export function materialActions({
  material,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  onRemovePhoto,
  onRemoveBrandPhotos,
}: {
  material: Material;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
  /** Admin only: takedown of one of the entry's photos. */
  onRemovePhoto?: (imageId: number) => void;
  /** Admin only: takedown of every photo of the entry's brand. */
  onRemoveBrandPhotos?: () => void;
}): ReactNode {
  const actions: RowAction[] = [];
  if (canEdit) {
    actions.push({ label: "Edit entry", icon: <EditIcon />, onClick: onEdit });
  }
  const photos = material.images;
  if (onRemovePhoto) {
    photos.forEach((image, index) => {
      actions.push({
        label:
          photos.length === 1 ? "Remove photo" : `Remove photo ${index + 1}`,
        icon: <PhotoIcon />,
        onClick: () => onRemovePhoto(image.id),
        danger: true,
        groupStart: index === 0 && actions.length > 0,
      });
    });
  }
  if (onRemoveBrandPhotos && photos.length > 0) {
    actions.push({
      label: `Remove all ${material.brand} photos`,
      icon: <PhotoIcon />,
      onClick: onRemoveBrandPhotos,
      danger: true,
    });
  }
  if (canDelete) {
    actions.push({
      label: "Delete entry",
      icon: <DeleteIcon />,
      onClick: onDelete,
      danger: true,
      groupStart: actions.length > 0,
    });
  }
  return <RowMenu actions={actions} label="Entry actions" />;
}

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
  onPickSize,
  onSuggest,
}: {
  material: Material;
  onSuggest: () => void;
  /** Opens another size of the model: the URL holds the entry id. */
  onPickSize: (id: number) => void;
}) {
  const [units] = useUnits();
  const sizes = modelSizes(material);
  const siblings = useMaterialComparison(sizes.map((size) => size.id));
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
  const allSizes =
    siblings.data && siblings.data.length > 1 ? siblings.data : [];

  return (
    <Box sx={{ pt: 1, pb: 3 }}>
      <MaterialGallery material={material} />
      <DetailCard heading="Overview" sx={{ py: 1 }}>
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
      </DetailCard>

      {allSizes.length > 0 ? (
        <Box>
          <Box sx={{ mx: { xs: `${tokens.phone.edge}px`, md: 0 } }}>
            <SectionHeading inset>All sizes</SectionHeading>
          </Box>
          <AllSizesTable
            materials={allSizes}
            pickedId={material.id}
            onPick={onPickSize}
          />
        </Box>
      ) : (
        <SpecCards material={material} units={units} />
      )}

      <SuggestChange material={material} onSuggest={onSuggest} />

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
  );
}

/** What one entry states, as a card per block (hull, cockpit, paddler; a
 * paddle's own specs): the list of a model with a single size. */
function SpecCards({ material, units }: { material: Material; units: Units }) {
  const groups = new Map<string, SpecRow[]>();
  for (const row of specRows(material, units)) {
    groups.set(row.group, [...(groups.get(row.group) ?? []), row]);
  }
  if (groups.size === 0) return null;
  return (
    <Box
      data-testid="spec-cards"
      sx={{
        display: "grid",
        // The cards sit side by side where the width allows.
        gridTemplateColumns: { md: "repeat(auto-fill, minmax(340px, 480px))" },
        columnGap: 1,
        alignItems: "start",
      }}
    >
      {[...groups].map(([group, rows]) => (
        <DetailCard key={group} heading={group}>
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
