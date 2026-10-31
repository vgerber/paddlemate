import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import Fact from "@/components/Fact";
import AllSizesTable from "@/components/materials/AllSizesTable";
import MaterialGallery from "@/components/materials/MaterialGallery";
import SizePicker from "@/components/materials/SizePicker";
import { phoneCardSx } from "@/components/phone/phoneGrid";
import RowMenu, { type RowAction } from "@/components/RowMenu";
import SectionHeading from "@/components/SectionHeading";
import type { Material } from "@/lib/api";
import { useMaterialComparison } from "@/lib/hooks/useMaterials";
import { DeleteIcon, EditIcon, OpenExternalIcon, PhotoIcon } from "@/lib/icons";
import {
  CATEGORY_LABELS,
  enumLabel,
  formatSpec,
  MATERIAL_SPECS,
  modelSizes,
  paddleFacts,
  SPEC_GROUP_LABELS,
  sizeFacts,
  sourceLinks,
  specValue,
  yearsLabel,
} from "@/lib/materials/materials";
import { useUnits } from "@/lib/prefs/units";
import { formatDate } from "@/lib/text/format";
import { withAlpha } from "@/lib/theme/alpha";
import { theme } from "@/lib/theme/theme";

const { tokens } = theme;

const cardSx = {
  ...phoneCardSx,
  px: `${tokens.phone.inner}px`,
  py: 1,
  mb: 1,
} as const;

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 2,
        minHeight: tokens.touch.min,
        "&:not(:last-child)": {
          borderBottom: `1px solid ${withAlpha(tokens.outlineVariant, "hairline")}`,
        },
      }}
    >
      <Typography variant="body2" color="textSecondary">
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function Card({
  heading,
  children,
}: {
  heading?: string;
  children: ReactNode;
}) {
  return (
    <Box>
      {heading && (
        <Box sx={{ mx: { xs: `${tokens.phone.edge}px`, md: 0 } }}>
          <SectionHeading inset>{heading}</SectionHeading>
        </Box>
      )}
      <Box sx={cardSx}>{children}</Box>
    </Box>
  );
}

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
  const facts = [
    { label: "Category", value: CATEGORY_LABELS[material.category] },
  ];
  if (material.discipline) {
    facts.push({ label: "Discipline", value: enumLabel(material.discipline) });
  }
  if (material.construction) {
    facts.push({
      label: "Construction",
      value: enumLabel(material.construction),
    });
  }
  if (yearsLabel(material)) {
    facts.push({ label: "Built", value: yearsLabel(material) });
  }
  const paddle = paddleFacts(material, units);
  const sources = sourceLinks(material.sources);

  return (
    <Box sx={{ pt: 1, pb: 3 }}>
      <MaterialGallery material={material} />
      {sizes.length > 0 && (
        <Box sx={{ ...cardSx, py: 2, display: "grid", gap: 2 }}>
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
        </Box>
      )}
      <Box sx={{ ...cardSx, py: 2 }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            gap: 2,
          }}
        >
          {facts.map((fact) => (
            <Fact key={fact.label} label={fact.label} value={fact.value} />
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
              <Chip key={color} label={color} sx={{ maxWidth: "100%" }} />
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
      </Box>

      {paddle.length > 0 && (
        <Card heading="Paddle">
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
        </Card>
      )}

      {(["hull", "cockpit", "paddler"] as const).map((group) => {
        const specs = MATERIAL_SPECS.filter(
          (spec) =>
            spec.group === group && specValue(material, spec.key) != null,
        );
        // A paddle's weight is among its facts; the boat groups do not apply.
        if (specs.length === 0 || material.category === "paddle") return null;
        return (
          <Card key={group} heading={SPEC_GROUP_LABELS[group]}>
            {specs.map((spec) => (
              <SpecRow
                key={spec.key}
                label={spec.label}
                value={formatSpec(specValue(material, spec.key), spec, units)}
              />
            ))}
          </Card>
        );
      })}

      {siblings.data && siblings.data.length > 1 && (
        <Box>
          <Box sx={{ mx: { xs: `${tokens.phone.edge}px`, md: 0 } }}>
            <SectionHeading inset>All sizes</SectionHeading>
          </Box>
          <AllSizesTable materials={siblings.data} pickedId={material.id} />
        </Box>
      )}

      {sources.length > 0 && (
        <Card heading="Sources">
          <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
            {sources.map((source) => (
              <Box component="li" key={source.url}>
                <Link
                  href={source.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.75,
                    minHeight: tokens.touch.min,
                    overflowWrap: "anywhere",
                  }}
                >
                  <span>
                    {source.host}
                    <Typography
                      variant="body2"
                      color="textSecondary"
                      component="span"
                    >
                      {` - ${source.fields.join(", ")}`}
                    </Typography>
                  </span>
                  <OpenExternalIcon sx={{ fontSize: 16, flexShrink: 0 }} />
                </Link>
              </Box>
            ))}
          </Box>
        </Card>
      )}

      <Card heading="Source">
        {material.product_url && (
          <Link
            href={material.product_url}
            target="_blank"
            rel="noreferrer noopener"
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.75,
              minHeight: tokens.touch.min,
              overflowWrap: "anywhere",
            }}
          >
            Manufacturer page
            <OpenExternalIcon sx={{ fontSize: 16 }} />
          </Link>
        )}
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
      </Card>
    </Box>
  );
}
