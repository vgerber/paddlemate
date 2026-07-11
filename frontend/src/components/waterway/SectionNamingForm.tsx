import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";
import FormControl from "@mui/material/FormControl";
import IconButton from "@mui/material/IconButton";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { LANGUAGE_CODES, preferredLanguage } from "@/lib/localization";

export interface SectionTranslationDraft {
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

/** Fresh naming state; the primary language defaults to the browser's. */
export function createInitialNaming(): SectionNamingValue {
  const browser = preferredLanguage();
  return {
    langCode: LANGUAGE_CODES.includes(browser) ? browser : "en",
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
  const usedLanguages = new Set([
    value.langCode,
    ...value.translations.map((t) => t.langCode),
  ]);
  const availableLanguages = LANGUAGE_CODES.filter(
    (lc) => !usedLanguages.has(lc),
  );

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
        <FormControl sx={{ minWidth: 100 }}>
          <InputLabel id="primary-lang-label">Language</InputLabel>
          <Select
            labelId="primary-lang-label"
            label="Language"
            value={value.langCode}
            onChange={(e) => onChange({ ...value, langCode: e.target.value })}
          >
            {[value.langCode, ...availableLanguages].map((lc) => (
              <MenuItem key={lc} value={lc}>
                {lc.toUpperCase()}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
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

      {(value.translations.length > 0 || availableLanguages.length > 0) && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Typography variant="overline" sx={{ lineHeight: 1 }}>
              Translations (optional)
            </Typography>
            <Box sx={{ flex: 1 }} />
            {availableLanguages.length > 0 && (
              <IconButton
                aria-label="Add translation"
                onClick={() =>
                  onChange({
                    ...value,
                    translations: [
                      ...value.translations,
                      {
                        langCode: availableLanguages[0],
                        name: "",
                        description: "",
                      },
                    ],
                  })
                }
              >
                <AddIcon fontSize="small" />
              </IconButton>
            )}
          </Box>

          {value.translations.map((translation, index) => (
            <Box
              key={translation.langCode}
              sx={{ display: "flex", flexDirection: "column", gap: 2 }}
            >
              <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
                <FormControl sx={{ minWidth: 100 }}>
                  <InputLabel id={`translation-lang-${translation.langCode}`}>
                    Language
                  </InputLabel>
                  <Select
                    labelId={`translation-lang-${translation.langCode}`}
                    label="Language"
                    value={translation.langCode}
                    onChange={(e) =>
                      updateTranslation(index, { langCode: e.target.value })
                    }
                  >
                    {[translation.langCode, ...availableLanguages].map((lc) => (
                      <MenuItem key={lc} value={lc}>
                        {lc.toUpperCase()}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
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
      )}
    </Box>
  );
}
