import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import LanguagePicker from "@/components/LanguagePicker";
import { preferredLanguage } from "@/lib/languagePreference";
import { languageOptions } from "@/lib/languages";

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
  region: string;
  country: string;
  translations: SectionTranslationDraft[];
}

/** Fresh naming state; the primary language defaults to the reader's. */
export function createInitialNaming(): SectionNamingValue {
  return {
    langCode: preferredLanguage(),
    name: "",
    description: "",
    region: "",
    country: "",
    translations: [],
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
      <Box sx={{ display: "flex", gap: 2 }}>
        <LanguagePicker
          value={value.langCode}
          onChange={(langCode) => onChange({ ...value, langCode })}
          exclude={value.translations.map((t) => t.langCode)}
        />
        <TextField
          label="Name"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          required
          fullWidth
        />
      </Box>

      <Box sx={{ display: "flex", gap: 2 }}>
        <TextField
          label="Region"
          value={value.region}
          onChange={(e) => onChange({ ...value, region: e.target.value })}
          fullWidth
        />
        <TextField
          label="Country"
          value={value.country}
          onChange={(e) => onChange({ ...value, country: e.target.value })}
          sx={{ maxWidth: 110 }}
        />
      </Box>

      <TextField
        label="Description"
        multiline
        minRows={3}
        value={value.description}
        onChange={(e) => onChange({ ...value, description: e.target.value })}
        fullWidth
      />

      {
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Typography variant="overline" sx={{ lineHeight: 1 }}>
              Translations (optional)
            </Typography>
            <Box sx={{ flex: 1 }} />
            <IconButton
              aria-label="Add translation"
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
              <AddIcon fontSize="small" />
            </IconButton>
          </Box>

          {value.translations.map((translation, index) => (
            <Box
              key={translation.id}
              sx={{ display: "flex", flexDirection: "column", gap: 2 }}
            >
              <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
                <LanguagePicker
                  value={translation.langCode}
                  onChange={(langCode) =>
                    updateTranslation(index, { langCode })
                  }
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
        </Box>
      }
    </Box>
  );
}
