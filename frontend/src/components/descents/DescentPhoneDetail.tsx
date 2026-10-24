import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { phoneCardSx } from "@/components/canvas/flatRow";
import Fact from "@/components/Fact";
import WaterwayMap from "@/components/map/LazyMap";
import SectionHeading from "@/components/SectionHeading";
import type { Descent, DescentSection, SectionWithFeatures } from "@/lib/api";
import { durationLabel, formatDate, formatTime } from "@/lib/format";
import { theme } from "@/lib/theme";
import LogSectionRow from "./LogSectionRow";

const { tokens } = theme;
const { phone } = tokens;

/** On a phone each block is a card on the ground; its text sits on the 28
 * line. */
const blockSx = { ...phoneCardSx, p: `${phone.inner}px` } as const;

const factsSx = {
  display: "flex",
  flexWrap: "wrap",
  columnGap: 4,
  rowGap: 1.5,
} as const;

const dayLabel = (iso: string) => formatDate(iso, { weekday: true });

/** A log on a phone: facts, its own route map, the sections and the note, one
 * card each. */
export default function DescentPhoneDetail({
  descent,
  sections,
  mapSections,
}: {
  descent: Descent;
  sections: DescentSection[];
  mapSections: SectionWithFeatures[];
}) {
  const multiDay =
    descent.start_time.slice(0, 10) !== descent.end_time.slice(0, 10);
  const duration = durationLabel(descent.start_time, descent.end_time);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Box
        sx={{ ...blockSx, display: "flex", flexDirection: "column", gap: 2 }}
      >
        <Box sx={factsSx}>
          {multiDay ? (
            <>
              <Fact
                label="From"
                value={dayLabel(descent.start_time)}
                caption={formatTime(descent.start_time)}
              />
              <Fact
                label="To"
                value={dayLabel(descent.end_time)}
                caption={formatTime(descent.end_time)}
              />
              {duration && <Fact label="Duration" value={duration} />}
            </>
          ) : (
            <>
              <Fact label="Date" value={dayLabel(descent.start_time)} />
              <Fact
                label="Time"
                value={duration ?? "-"}
                caption={`${formatTime(descent.start_time)} - ${formatTime(descent.end_time)}`}
              />
            </>
          )}
        </Box>
        {(descent.put_in_label || descent.take_out_label) && (
          <Box sx={factsSx}>
            {descent.put_in_label && (
              <Fact label="Put in" value={descent.put_in_label} />
            )}
            {descent.take_out_label && (
              <Fact label="Take out" value={descent.take_out_label} />
            )}
          </Box>
        )}
      </Box>

      {(mapSections.length > 0 || descent.put_in_lat != null) && (
        <Box
          sx={{
            height: 260,
            mx: `${phone.edge}px`,
            borderRadius: `${tokens.radii.md}px`,
            boxShadow: tokens.elevation.e1,
            overflow: "hidden",
            position: "relative",
          }}
        >
          <WaterwayMap
            sections={mapSections}
            chrome={{ minimal: true }}
            picking={{
              putIn:
                descent.put_in_lat != null && descent.put_in_lon != null
                  ? { lat: descent.put_in_lat, lon: descent.put_in_lon }
                  : null,
              takeOut:
                descent.take_out_lat != null && descent.take_out_lon != null
                  ? { lat: descent.take_out_lat, lon: descent.take_out_lon }
                  : null,
            }}
          />
        </Box>
      )}

      {sections.length > 0 && (
        <Box sx={blockSx}>
          <SectionHeading
            first
            component="h3"
          >{`Sections (${sections.length})`}</SectionHeading>
          <Box sx={{ display: "grid" }}>
            {sections.map((s, i) => (
              <LogSectionRow
                key={s.section_id}
                section={s}
                index={i}
                variant="line"
              />
            ))}
          </Box>
        </Box>
      )}

      {descent.note && (
        <Box sx={blockSx}>
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
