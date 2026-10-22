import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import LanguagePicker from "@/components/LanguagePicker";
import FormSection from "@/components/waterway/FormSection";
import { preferredLanguage } from "@/lib/languagePreference";
import { languageOptions } from "@/lib/languages";
import { theme } from "@/lib/theme";
import ProposalNoteField from "./ProposalNoteField";

const { tokens } = theme;

export interface SectionTranslationDraft {
  /** Stable across language changes, so editing a row does not remount it. */
  id: string;
  langCode: string;
  name: string;
  description: string;
}

export interface SectionNamingValue {
  /** Language of the primary name/description. */
  langCode: string;
  name: string;
  description: string;
  translations: SectionTranslationDraft[];
  /** Optional note for the reviewers. */
  note: string;
}

/** Fresh naming state; the primary language defaults to the reader's.
 * Regions and country are not asked for - the server derives them from the
 * section line after submission. */
export function createInitialNaming(): SectionNamingValue {
  return {
    langCode: preferredLanguage(),
    name: "",
    description: "",
    translations: [],
    note: "",
  };
}

interface SectionNamingFormProps {
  value: SectionNamingValue;
  onChange: (value: SectionNamingValue) => void;
}

/** Naming step of the suggest-section wizard: primary name/description in a
 * chosen language plus optional translations. Mirrors the layout idiom of
 * the log-descent form. */
export default function SectionNamingForm({
  value,
  onChange,
}: SectionNamingFormProps) {
  const usedLanguages = [
    value.langCode,
    ...value.translations.map((t) => t.langCode),
  ];

  /** Language to seed a new row with: the first suggested one still free. */
  function nextFreeLanguage(): string {
    const used = new Set(usedLanguages);
    const free = languageOptions(preferredLanguage()).find(
      (option) => !used.has(option.code),
    );
    return free?.code ?? "en";
  }

  function updateTranslation(
    index: number,
    patch: Partial<SectionTranslationDraft>,
  ) {
    onChange({
      ...value,
      translations: value.translations.map((t, i) =>
        i === index ? { ...t, ...patch } : t,
      ),
    });
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <FormSection
        label="Name this section"
        hint="How paddlers refer to this stretch - shown in search and on the map."
      >
        <TextField
          label="Name"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          slotProps={{ htmlInput: { "aria-required": true } }}
          fullWidth
        />

        <TextField
          label="Description"
          multiline
          minRows={3}
          value={value.description}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
          fullWidth
        />
      </FormSection>

      <FormSection
        label="Translations"
        hint="Optional - the name in other languages."
        action={
          <Button
            startIcon={<AddIcon />}
            // Its 16 padding less the hang FormSection gives the action.
            sx={{ minHeight: tokens.touch.min, mr: { xs: -0.75, md: 0 } }}
            onClick={() =>
              onChange({
                ...value,
                translations: [
                  ...value.translations,
                  {
                    id: crypto.randomUUID(),
                    langCode: nextFreeLanguage(),
                    name: "",
                    description: "",
                  },
                ],
              })
            }
          >
            Add translation
          </Button>
        }
      >
        <LanguagePicker
          label="Language of the name above"
          value={value.langCode}
          onChange={(langCode) => onChange({ ...value, langCode })}
          exclude={value.translations.map((t) => t.langCode)}
        />
        {value.translations.map((translation, index) => (
          <Box
            key={translation.id}
            sx={{ display: "flex", flexDirection: "column", gap: 2 }}
          >
            <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
              <LanguagePicker
                value={translation.langCode}
                onChange={(langCode) => updateTranslation(index, { langCode })}
                exclude={usedLanguages.filter(
                  (lc) => lc !== translation.langCode,
                )}
              />
              <TextField
                label="Name"
                value={translation.name}
                onChange={(e) =>
                  updateTranslation(index, { name: e.target.value })
                }
                fullWidth
              />
              <IconButton
                aria-label="Remove translation"
                onClick={() =>
                  onChange({
                    ...value,
                    translations: value.translations.filter(
                      (_, i) => i !== index,
                    ),
                  })
                }
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
            <TextField
              label="Description"
              multiline
              minRows={2}
              value={translation.description}
              onChange={(e) =>
                updateTranslation(index, { description: e.target.value })
              }
              fullWidth
            />
          </Box>
        ))}
      </FormSection>

      <ProposalNoteField
        value={value.note}
        onChange={(note) => onChange({ ...value, note })}
      />
    </Box>
  );
}
