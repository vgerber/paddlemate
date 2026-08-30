import ListIcon from "@mui/icons-material/List";
import WaterIcon from "@mui/icons-material/Water";
import Box from "@mui/material/Box";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";

export type ListView = "rivers" | "sections";

/** Rivers/sections result-list switch with live counts. */
export default function ListViewToggle({
  listView,
  onChange,
  riverCount,
  sectionCount,
  sectionsPending,
}: {
  listView: ListView;
  onChange: (view: ListView) => void;
  riverCount: number;
  sectionCount: number;
  sectionsPending: boolean;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        px: 1,
        pt: 1,
        pb: 1,
        gap: 0.5,
      }}
    >
      <ToggleButtonGroup
        value={listView}
        exclusive
        size="small"
        onChange={(_, v) => {
          if (v) onChange(v);
        }}
        sx={{
          width: "100%",
          "& .MuiToggleButton-root": {
            flex: 1,
            py: 0.25,
            px: 1,
            fontSize: "0.75rem",
          },
        }}
      >
        <ToggleButton value="rivers">
          {/* The server total, not the number loaded: paging in more results
              must not look like the search found more. */}
          <WaterIcon sx={{ fontSize: 14, mr: 0.5 }} /> Rivers ({riverCount})
        </ToggleButton>
        <ToggleButton value="sections">
          <ListIcon sx={{ fontSize: 14, mr: 0.5 }} /> Sections (
          {sectionsPending ? "…" : sectionCount})
        </ToggleButton>
      </ToggleButtonGroup>
    </Box>
  );
}
