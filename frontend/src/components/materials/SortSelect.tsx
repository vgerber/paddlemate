import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import type { MaterialSort } from "@/lib/api";
import { SORT_LABELS, SORTS } from "@/lib/materials/search";

/** The wiki's sort as one field, for the header of the desktop list. Name is
 * the default, so it stays out of the URL. */
export default function SortSelect({
  value,
  onChange,
}: {
  value: MaterialSort | undefined;
  onChange: (sort: MaterialSort | undefined) => void;
}) {
  return (
    <TextField
      select
      size="small"
      label="Sort by"
      value={value ?? "name"}
      onChange={(event) => {
        const sort = event.target.value as MaterialSort;
        onChange(sort === "name" ? undefined : sort);
      }}
      // Inset like the header's icon actions: off the card's edge and its
      // top and bottom.
      sx={{ width: 180, my: 1, mr: 1.5 }}
    >
      {SORTS.map((sort) => (
        <MenuItem key={sort} value={sort}>
          {SORT_LABELS[sort]}
        </MenuItem>
      ))}
    </TextField>
  );
}
