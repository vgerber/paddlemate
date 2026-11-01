import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import DetailCard from "@/components/DetailCard";
import Fact from "@/components/Fact";
import FactRow from "@/components/FactRow";
import AllSizesTable from "@/components/materials/AllSizesTable";
import MaterialGallery from "@/components/materials/MaterialGallery";
import SizePicker from "@/components/materials/SizePicker";
import SourceList, { type SourceLink } from "@/components/materials/SourceList";
import RowMenu, { type RowAction } from "@/components/RowMenu";
import SectionHeading from "@/components/SectionHeading";
import FilterChip from "@/components/search/FilterChip";
import type { Material } from "@/lib/api";
import { useMaterialComparison } from "@/lib/hooks/useMaterials";
import { DeleteIcon, EditIcon, PhotoIcon } from "@/lib/icons";
import {
  availabilityChecked,
  availabilityValue,
  sourceHost,
} from "@/lib/materials/availability";
import {
  modelSizes,
  paddleFacts,
  SIZE_FACT_KEYS,
  sinceLabel,
  sizeFacts,
  sourceLinks,
} from "@/lib/materials/facts";
import {
  CATEGORY_LABELS,
  disciplineLabel,
  formatSpec,
  MATERIAL_SPECS,
  SPEC_GROUP_LABELS,
  specValue,
} from "@/lib/materials/specs";
import { useUnits } from "@/lib/prefs/units";
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
}: {
  material: Material;
  /** Opens another size of the model: the URL holds the entry id. */
  onPickSize: (id: number) => void;
}) {
  const [units] = useUnits();
  const sizes = modelSizes(material);
  const siblings = useMaterialComparison(sizes.map((size) => size.id));
  const facts: { label: string; value: ReactNode; caption?: ReactNode }[] = [
    { label: "Category", value: CATEGORY_LABELS[material.category] },
  ];
  if (material.discipline) {
    facts.push({
      label: "Discipline",
      value: disciplineLabel(material.discipline, material.category),
    });
  }
  if (material.construction) {
    facts.push({
      label: "Construction",
      value: sentenceCase(humanize(material.construction)),
    });
  }
  if (sinceLabel(material)) {
    facts.push({ label: "Built", value: sinceLabel(material) });
  }
  facts.push({
    label: "Availability",
    value: availabilityValue(material),
    caption: <AvailabilityCaption material={material} />,
  });
  const paddle = paddleFacts(material, units);
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
    <Box sx={{ pt: 1, pb: 3 }}>
      <MaterialGallery material={material} />
      {sizes.length > 0 && (
        <DetailCard sx={{ py: 2, display: "grid", gap: 2 }}>
          <SizePicker
            sizes={sizes}
            pickedId={material.id}
            onPick={onPickSize}
          />
          <Box
            data-testid="size-facts"
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
              gap: 2,
            }}
          >
            {sizeFacts(material, units).map((fact) => (
              <Fact key={fact.label} label={fact.label} value={fact.value} />
            ))}
          </Box>
        </DetailCard>
      )}
      <DetailCard sx={{ py: 2 }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            gap: 2,
          }}
        >
          {facts.map((fact) => (
            <Fact
              key={fact.label}
              label={fact.label}
              value={fact.value}
              caption={fact.caption}
            />
          ))}
        </Box>
        {material.description && (
          <Typography
            variant="body2"
            sx={{ mt: 2, whiteSpace: "pre-line", overflowWrap: "anywhere" }}
          >
            {material.description}
          </Typography>
        )}
        {material.colors.length > 0 && (
          <Box
            data-testid="material-colors"
            sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 2 }}
          >
            {material.colors.map((color) => (
              <FilterChip key={color} label={color} set={false} />
            ))}
          </Box>
        )}
        {material.notes && (
          <Typography
            variant="body2"
            color="textSecondary"
            sx={{ mt: 2, whiteSpace: "pre-line", overflowWrap: "anywhere" }}
          >
            {material.notes}
          </Typography>
        )}
      </DetailCard>

      {paddle.length > 0 && (
        <DetailCard heading="Paddle">
          <Box
            data-testid="paddle-facts"
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
              gap: 2,
              py: 1,
            }}
          >
            {paddle.map((fact) => (
              <Fact key={fact.label} label={fact.label} value={fact.value} />
            ))}
          </Box>
        </DetailCard>
      )}

      <Box
        sx={{
          display: "grid",
          // The hull, cockpit and paddler cards sit side by side where the
          // width allows.
          gridTemplateColumns: {
            md: "repeat(auto-fit, minmax(340px, 1fr))",
          },
          columnGap: 1,
          alignItems: "start",
        }}
      >
        {(["hull", "cockpit", "paddler"] as const).map((group) => {
          // With a size picker, its facts already say length, volume, weight
          // and the paddler window; the cards keep the rest.
          const specs = MATERIAL_SPECS.filter(
            (spec) =>
              spec.group === group &&
              specValue(material, spec.key) != null &&
              !(
                sizes.length > 0 &&
                (SIZE_FACT_KEYS.includes(spec.key) || group === "paddler")
              ),
          );
          // A paddle's weight is among its facts; the boat groups do not apply.
          if (specs.length === 0 || material.category === "paddle") return null;
          return (
            <DetailCard key={group} heading={SPEC_GROUP_LABELS[group]}>
              {specs.map((spec) => (
                <FactRow
                  key={spec.key}
                  label={spec.label}
                  value={formatSpec(specValue(material, spec.key), spec, units)}
                />
              ))}
            </DetailCard>
          );
        })}
      </Box>

      {siblings.data && siblings.data.length > 1 && (
        <Box>
          <Box sx={{ mx: { xs: `${tokens.phone.edge}px`, md: 0 } }}>
            <SectionHeading inset>All sizes</SectionHeading>
          </Box>
          <AllSizesTable materials={siblings.data} pickedId={material.id} />
        </Box>
      )}

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
