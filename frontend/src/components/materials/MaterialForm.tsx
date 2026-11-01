import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import { useEffect, useRef, useState } from "react";
import PanelBottomBar, { RoundActionButton } from "@/components/PanelBottomBar";
import FormSection from "@/components/waterway/FormSection";
import ProposalNoteField from "@/components/waterway/ProposalNoteField";
import { proposalNoteValue } from "@/components/waterway/proposalNote";
import type { Material, MaterialProposalBody } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api/client";
import { useSession } from "@/lib/hooks/useSession";
import { ConfirmIcon } from "@/lib/icons";
import {
  canSaveMaterial,
  type MaterialFormValues,
  materialFormToBody,
} from "@/lib/materials/form";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  CONSTRUCTIONS,
  DISCIPLINES,
  MATERIAL_LIMITS,
  MATERIAL_SPECS,
  PADDLE_SPECS,
  type PaddleKey,
  SHAFT_MATERIALS,
  SHAFTS,
  SPEC_GROUP_LABELS,
  type SpecKey,
} from "@/lib/materials/specs";
import { unitLabel, useUnits } from "@/lib/prefs/units";
import { humanize, sentenceCase } from "@/lib/text/format";
import { PANEL_HEIGHT, theme } from "@/lib/theme/theme";

const { tokens } = theme;

/** Width of the form card on a desktop, px. */
const FORM_WIDTH = 720;

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
  original,
}: {
  values: MaterialFormValues;
  onChange: (values: MaterialFormValues) => void;
  onCancel: () => void;
  onSubmit: (body: MaterialProposalBody) => void;
  title: string;
  subtitle: string;
  saving: boolean;
  error: unknown;
  /** The entry being corrected: fields the reader leaves alone keep their
   * stored value. */
  original?: Material;
}) {
  const [units] = useUnits();
  const { isAdmin } = useSession();
  const [note, setNote] = useState("");
  const set = (patch: Partial<MaterialFormValues>) =>
    onChange({ ...values, ...patch });

  // The error renders below the fields, out of sight of the save button that
  // caused it - bring it into view, or a refused save looks like no save.
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error != null) errorRef.current?.scrollIntoView({ block: "nearest" });
  }, [error]);

  const numberField = (
    key: SpecKey | PaddleKey | "year_from" | "year_to" | "pieces",
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

  const listField = (
    key: "lengths_cm" | "feather_deg",
    label: string,
    helperText: string,
  ) => (
    <TextField
      label={label}
      value={values[key]}
      helperText={helperText}
      onChange={(event) => set({ [key]: event.target.value })}
      slotProps={{ htmlInput: { maxLength: 80 } }}
    />
  );

  const isPaddle = values.category === "paddle";

  const textField = (
    key:
      | "brand"
      | "model"
      | "variant"
      | "size"
      | "blade_material"
      | "shaft_diameter",
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
    // From md the form is one card on the page's ground, its bottom bar the
    // card's own foot; a phone gets the whole screen.
    <Box
      sx={{
        height: PANEL_HEIGHT,
        display: "flex",
        flexDirection: "column",
        px: { md: 2 },
        py: { md: 2 },
        boxSizing: "border-box",
      }}
    >
      <Box
        sx={{
          position: { xs: "fixed", md: "static" },
          inset: { xs: 0 },
          // Over the bottom nav (1300), like the log form's bar.
          zIndex: 1350,
          flex: 1,
          minHeight: 0,
          width: "100%",
          maxWidth: { md: FORM_WIDTH },
          mx: "auto",
          display: "flex",
          flexDirection: "column",
          bgcolor: { xs: "background.default", md: tokens.surface },
          borderRadius: { md: `${tokens.radii.md}px` },
          boxShadow: { md: tokens.elevation.e1 },
          overflow: "hidden",
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
                  category: event.target
                    .value as MaterialFormValues["category"],
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
              helperText: "Edition or trim, such as PRO or Carbolight",
            })}
            {textField("size", "Size", {
              helperText: "S, M, L or a number, if the model comes in sizes",
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
                    {sentenceCase(humanize(discipline))}
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
                    {sentenceCase(humanize(construction))}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
            <Box sx={fieldGridSx}>
              {numberField("year_from", "First year")}
              {numberField("year_to", "Last year")}
            </Box>
            <FormControlLabel
              control={
                <Checkbox
                  checked={values.year_approximate}
                  onChange={(event) =>
                    set({ year_approximate: event.target.checked })
                  }
                  sx={{ width: tokens.touch.min, height: tokens.touch.min }}
                />
              }
              label="The years are approximate"
              sx={{ minHeight: tokens.touch.min }}
            />
          </FormSection>

          {isPaddle && (
            <FormSection
              label="Paddle"
              hint="Blade, shaft and the lengths it comes in."
            >
              <Box sx={fieldGridSx}>
                {PADDLE_SPECS.map((spec) =>
                  numberField(
                    spec.key,
                    `${spec.label} (${unitLabel(spec.quantity, units)})`,
                  ),
                )}
                {numberField(
                  "weight_kg",
                  `Weight (${unitLabel("weight", units)})`,
                )}
                {numberField("pieces", "Pieces")}
              </Box>
              {listField(
                "lengths_cm",
                `Sizes (${unitLabel("length", units)})`,
                "Separate several with commas",
              )}
              {listField(
                "feather_deg",
                "Feather angles (degrees)",
                "Separate several with commas",
              )}
              <Box sx={fieldGridSx}>
                <TextField
                  select
                  label="Shaft"
                  value={values.shaft}
                  onChange={(event) =>
                    set({
                      shaft: event.target.value as MaterialFormValues["shaft"],
                    })
                  }
                >
                  <MenuItem value="">Unstated</MenuItem>
                  {SHAFTS.map((shaft) => (
                    <MenuItem key={shaft} value={shaft}>
                      {sentenceCase(humanize(shaft))}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  label="Shaft material"
                  value={values.shaft_material}
                  onChange={(event) =>
                    set({
                      shaft_material: event.target
                        .value as MaterialFormValues["shaft_material"],
                    })
                  }
                >
                  <MenuItem value="">Unstated</MenuItem>
                  {SHAFT_MATERIALS.map((material) => (
                    <MenuItem key={material} value={material}>
                      {sentenceCase(humanize(material))}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>
              {textField("blade_material", "Blade material")}
              {textField("shaft_diameter", "Shaft diameter")}
            </FormSection>
          )}

          {(isPaddle ? [] : (["hull", "cockpit", "paddler"] as const)).map(
            (group) => (
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
            ),
          )}

          <FormSection
            label="Notes"
            hint="How it paddles, and where the numbers came from."
          >
            <TextField
              label="Colours"
              value={values.colors}
              helperText="Separate several with commas"
              onChange={(event) => set({ colors: event.target.value })}
              slotProps={{ htmlInput: { maxLength: 3000 } }}
            />
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
              label="Notes"
              multiline
              minRows={2}
              value={values.notes}
              onChange={(event) => set({ notes: event.target.value })}
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

          {!isAdmin && (
            <ProposalNoteField
              value={note}
              onChange={setNote}
              disabled={saving}
            />
          )}

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
              onClick={() =>
                onSubmit({
                  ...materialFormToBody(values, units, original),
                  proposal_note: isAdmin ? null : proposalNoteValue(note),
                })
              }
            >
              <ConfirmIcon />
            </RoundActionButton>
          }
        />
      </Box>
    </Box>
  );
}
