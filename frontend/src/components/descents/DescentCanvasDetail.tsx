import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import SectionHeading from "@/components/SectionHeading";
import type { Descent, DescentSection } from "@/lib/api";
import DescentOverview from "./DescentOverview";
import LogSectionRow from "./LogSectionRow";

/** A log in the canvas card, where the map already draws the route. The
 * overview names the sections and the level, so a section row stays only
 * where the paddler wrote a note on it. */
export default function DescentCanvasDetail({
  descent,
  sections,
}: {
  descent: Descent;
  /** In paddled order. */
  sections: DescentSection[];
}) {
  const noted = sections.filter((s) => s.note);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Box sx={{ mb: 1 }}>
        <DescentOverview descent={descent} />
      </Box>

      {noted.length > 0 && (
        <Box sx={{ mt: 1 }}>
          <SectionHeading first component="h3">
            Section notes
          </SectionHeading>
          <Box sx={{ display: "grid", gap: 1 }}>
            {noted.map((s) => (
              <LogSectionRow
                key={s.section_id}
                section={s}
                index={sections.indexOf(s)}
                variant="tile"
              />
            ))}
          </Box>
        </Box>
      )}

      {descent.note && (
        <Box>
          <SectionHeading first component="h3">
            Note
          </SectionHeading>
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
            {descent.note}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
