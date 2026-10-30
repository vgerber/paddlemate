import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import { useEffect, useRef } from "react";
import PanelBottomBar, { RoundActionButton } from "@/components/PanelBottomBar";
import FormSection from "@/components/waterway/FormSection";
import type { MaterialBody } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api/client";
import { ConfirmIcon } from "@/lib/icons";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  CONSTRUCTIONS,
  canSaveMaterial,
  DISCIPLINES,
  enumLabel,
  MATERIAL_LIMITS,
  MATERIAL_SPECS,
  type MaterialFormValues,
  materialFormToBody,
  SPEC_GROUP_LABELS,
  type SpecKey,
} from "@/lib/materials";
import { theme } from "@/lib/theme";
import { unitLabel, useUnits } from "@/lib/units";

const { tokens } = theme;

const SPEC_HINTS = {
  hull: "Outer dimensions, as the manufacturer states them.",
  cockpit: "The opening, for checking a spraydeck fits.",
  paddler: "The body weight window the boat is built for.",
} as const;

/** Number fields sit in a grid that drops to one column when two would be
 * narrower than a value needs. */
const fieldGridSx = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 1.5,
} as const;

/** Add or correct one wiki entry. Everything past brand and model is
 * optional: an entry that says only what it is called is still worth having,
 * and the next reader fills in the rest. A phone gets the whole screen, the
 * bottom nav included, as the log form does. */
export default function MaterialForm({
  values,
  onChange,
  onCancel,
  onSubmit,
  title,
  subtitle,
  saving,
  error,
}: {
  values: MaterialFormValues;
  onChange: (values: MaterialFormValues) => void;
  onCancel: () => void;
  onSubmit: (body: MaterialBody) => void;
  title: string;
  subtitle: string;
  saving: boolean;
  error: unknown;
}) {
  const [units] = useUnits();
  const set = (patch: Partial<MaterialFormValues>) =>
    onChange({ ...values, ...patch });

  // The error renders below the fields, out of sight of the save button that
  // caused it - bring it into view, or a refused save looks like no save.
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error != null) errorRef.current?.scrollIntoView({ block: "nearest" });
  }, [error]);

  const numberField = (
    key: SpecKey | "year_from" | "year_to",
    label: string,
  ) => (
    <TextField
      key={key}
      label={label}
      value={values[key]}
      onChange={(event) => set({ [key]: event.target.value })}
      slotProps={{ htmlInput: { inputMode: "decimal", maxLength: 8 } }}
    />
  );

  const textField = (
    key: "brand" | "model" | "variant",
    label: string,
    extra: { required?: boolean; helperText?: string } = {},
  ) => (
    <TextField
      label={label}
      value={values[key]}
      onChange={(event) => set({ [key]: event.target.value })}
      slotProps={{ htmlInput: { maxLength: MATERIAL_LIMITS.name } }}
      {...extra}
    />
  );

  return (
    <Box
      sx={{
        position: { xs: "fixed", md: "static" },
        inset: { xs: 0 },
        // Over the bottom nav (1300), like the log form's bar.
        zIndex: 1350,
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.default",
      }}
    >
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          px: { xs: `${tokens.phone.line}px`, md: 2 },
          py: 2,
          display: "flex",
          flexDirection: "column",
          gap: 2.5,
        }}
      >
        <FormSection label="Boat" hint="What it is and what it is called.">
          <TextField
            select
            label="Category"
            value={values.category}
            onChange={(event) =>
              set({
                category: event.target.value as MaterialFormValues["category"],
              })
            }
          >
            {CATEGORIES.map((category) => (
              <MenuItem key={category} value={category}>
                {CATEGORY_LABELS[category]}
              </MenuItem>
            ))}
          </TextField>
          {textField("brand", "Brand", { required: true })}
          {textField("model", "Model", { required: true })}
          {textField("variant", "Variant", {
            helperText: "Size or trim, if the model comes in more than one",
          })}
        </FormSection>

        <FormSection
          label="Type"
          hint="What the boat is built for, and when it was sold."
        >
          <Box sx={fieldGridSx}>
            <TextField
              select
              label="Discipline"
              value={values.discipline}
              onChange={(event) =>
                set({
                  discipline: event.target
                    .value as MaterialFormValues["discipline"],
                })
              }
            >
              <MenuItem value="">Unstated</MenuItem>
              {DISCIPLINES.map((discipline) => (
                <MenuItem key={discipline} value={discipline}>
                  {enumLabel(discipline)}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Construction"
              value={values.construction}
              onChange={(event) =>
                set({
                  construction: event.target
                    .value as MaterialFormValues["construction"],
                })
              }
            >
              <MenuItem value="">Unstated</MenuItem>
              {CONSTRUCTIONS.map((construction) => (
                <MenuItem key={construction} value={construction}>
                  {enumLabel(construction)}
                </MenuItem>
              ))}
            </TextField>
          </Box>
          <Box sx={fieldGridSx}>
            {numberField("year_from", "First year")}
            {numberField("year_to", "Last year")}
          </Box>
        </FormSection>

        {(["hull", "cockpit", "paddler"] as const).map((group) => (
          <FormSection
            key={group}
            label={SPEC_GROUP_LABELS[group]}
            hint={SPEC_HINTS[group]}
          >
            <Box sx={fieldGridSx}>
              {MATERIAL_SPECS.filter((spec) => spec.group === group).map(
                (spec) =>
                  numberField(
                    spec.key,
                    `${spec.label} (${unitLabel(spec.quantity, units)})`,
                  ),
              )}
            </Box>
          </FormSection>
        ))}

        <FormSection
          label="Notes"
          hint="How it paddles, and where the numbers came from."
        >
          <TextField
            label="Description"
            multiline
            minRows={3}
            value={values.description}
            onChange={(event) => set({ description: event.target.value })}
            slotProps={{
              htmlInput: { maxLength: MATERIAL_LIMITS.description },
            }}
          />
          <TextField
            label="Manufacturer page"
            placeholder="https://"
            value={values.product_url}
            onChange={(event) => set({ product_url: event.target.value })}
            slotProps={{
              htmlInput: { inputMode: "url", maxLength: MATERIAL_LIMITS.url },
            }}
          />
        </FormSection>

        {error != null && (
          <Alert ref={errorRef} severity="error">
            {apiErrorMessage(error, "Could not save this entry.")}
          </Alert>
        )}
      </Box>

      <PanelBottomBar
        onLeftClick={onCancel}
        leftLabel="Cancel"
        leftDisabled={saving}
        title={title}
        subtitle={subtitle}
        action={
          <RoundActionButton
            ariaLabel="Save entry"
            disabled={!canSaveMaterial(values)}
            busy={saving}
            onClick={() => onSubmit(materialFormToBody(values, units))}
          >
            <ConfirmIcon />
          </RoundActionButton>
        }
      />
    </Box>
  );
}
