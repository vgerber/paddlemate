import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { phoneCardSx } from "@/components/canvas/flatRow";
import Fact from "@/components/Fact";
import RowMenu, { type RowAction } from "@/components/RowMenu";
import SectionHeading from "@/components/SectionHeading";
import type { Material } from "@/lib/api";
import { DeleteIcon, EditIcon, OpenExternalIcon } from "@/lib/icons";
import {
  CATEGORY_LABELS,
  enumLabel,
  formatSpec,
  MATERIAL_SPECS,
  SPEC_GROUP_LABELS,
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
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}): ReactNode {
  const actions: RowAction[] = [];
  if (canEdit) {
    actions.push({ label: "Edit entry", icon: <EditIcon />, onClick: onEdit });
  }
  if (canDelete) {
    actions.push({
      label: "Delete entry",
      icon: <DeleteIcon />,
      onClick: onDelete,
      danger: true,
      groupStart: canEdit,
    });
  }
  return <RowMenu actions={actions} label="Entry actions" />;
}

/** One wiki entry in full: what it is, every measurement it states, where
 * the numbers come from and who put them there. */
export default function MaterialDetailView({
  material,
}: {
  material: Material;
}) {
  const [units] = useUnits();
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

  return (
    <Box sx={{ pt: 1, pb: 3 }}>
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
      </Box>

      {(["hull", "cockpit", "paddler"] as const).map((group) => {
        const specs = MATERIAL_SPECS.filter(
          (spec) =>
            spec.group === group && specValue(material, spec.key) != null,
        );
        if (specs.length === 0) return null;
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
