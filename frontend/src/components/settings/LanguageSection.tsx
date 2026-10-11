import Box from "@mui/material/Box";
import LanguagePicker from "@/components/LanguagePicker";
import FormSection from "@/components/waterway/FormSection";
import { useLanguagePreference } from "@/lib/languagePreference";

export default function LanguageSection() {
  const [language, setLanguage] = useLanguagePreference();

  return (
    <FormSection
      label="Names"
      hint="Which translation of river, section and rapid names is shown. The app interface stays in English."
    >
      <Box sx={{ maxWidth: 360 }}>
        <LanguagePicker
          value={language}
          onChange={setLanguage}
          label="Language"
        />
      </Box>
    </FormSection>
  );
}
