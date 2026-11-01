import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import NativeSelect from "@mui/material/NativeSelect";
import Typography from "@mui/material/Typography";
import { Link } from "@tanstack/react-router";
import type { Material } from "@/lib/api";
import { useMaterial } from "@/lib/hooks/useMaterials";
import { CloseIcon } from "@/lib/icons";
import { materialTitle, modelSizes } from "@/lib/materials/facts";
import { focusRing } from "@/lib/theme/focusRing";
import { cardTitleSx, labelSx, theme } from "@/lib/theme/theme";

const { tokens } = theme;

function EntrySize({
  material,
  onResize,
}: {
  material: Material;
  onResize: (from: number, to: number) => void;
}) {
  // The list does not carry the other sizes; the entry does.
  const detail = useMaterial(material.id);
  const sizes = modelSizes(detail.data ?? material);
  if (sizes.length === 0) {
    return material.size ? (
      <Typography
        variant="body2"
        sx={{ fontWeight: 600, minHeight: 44, py: 1.25 }}
      >
        {material.size}
      </Typography>
    ) : null;
  }
  return (
    <NativeSelect
      disableUnderline
      value={material.id}
      onChange={(event) => onResize(material.id, Number(event.target.value))}
      inputProps={{ "aria-label": `Size of ${materialTitle(material)}` }}
      sx={{
        minHeight: tokens.touch.min,
        fontSize: "0.875rem",
        fontWeight: 600,
        maxWidth: "100%",
        "& .MuiNativeSelect-select:focus-visible": focusRing(-2),
      }}
    >
      {sizes.map(({ id, size }) => (
        <option key={id} value={id}>
          {size ?? "-"}
        </option>
      ))}
    </NativeSelect>
  );
}

/** The head of one column: the entry's name as a link, its size as a choice
 * and the way to drop it. */
export default function ComparisonHead({
  material,
  onRemove,
  onResize,
}: {
  material: Material;
  onRemove: (id: number) => void;
  onResize: (from: number, to: number) => void;
}) {
  const name = [material.model, material.variant].filter(Boolean).join(" ");
  return (
    <Box
      role="columnheader"
      sx={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        pb: 0.5,
        pr: { md: 5 },
        pt: { md: 1 },
      }}
    >
      <IconButton
        onClick={() => onRemove(material.id)}
        aria-label={`Remove ${materialTitle(material)} from the comparison`}
        sx={{
          order: -1,
          alignSelf: "flex-end",
          width: tokens.touch.min,
          height: tokens.touch.min,
          mr: -1.5,
          mb: -1.5,
          flexShrink: 0,
          // From md the column is wide enough to carry it beside the name.
          position: { md: "absolute" },
          top: { md: 0 },
          right: { md: 0 },
          m: { md: 0 },
        }}
      >
        <CloseIcon fontSize="small" />
      </IconButton>
      <Link
        to="/materials/$materialId"
        params={{ materialId: String(material.id) }}
        search={{ edit: false }}
        style={{
          textDecoration: "none",
          minWidth: 0,
          minHeight: tokens.touch.min,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <Typography
          sx={{ ...labelSx, overflowWrap: "anywhere", lineHeight: "16px" }}
        >
          {material.brand}
        </Typography>
        <Typography
          sx={{
            ...cardTitleSx,
            color: "text.primary",
            overflowWrap: "anywhere",
          }}
        >
          {name}
        </Typography>
      </Link>
      <EntrySize material={material} onResize={onResize} />
    </Box>
  );
}
