import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { HistoryChange } from "@/lib/api";
import { changeValue, fieldLabel, isGeometryChange } from "./steps";

const lineSx = { fontSize: "0.8125rem", lineHeight: "18px" } as const;

function ChangeLine({ change }: { change: HistoryChange }) {
  const { field, before, after } = change;
  return (
    <Box
      data-testid="history-change"
      sx={{
        display: "grid",
        gridTemplateColumns: "76px minmax(0, 1fr)",
        columnGap: 1,
        ...lineSx,
      }}
    >
      <Typography component="span" sx={{ ...lineSx, color: "text.secondary" }}>
        {fieldLabel(field)}
      </Typography>
      <Typography component="span" sx={{ ...lineSx, overflowWrap: "anywhere" }}>
        {isGeometryChange(change) ? (
          "changed"
        ) : (
          <>
            {before != null && (
              <>
                <Typography
                  data-testid="change-before"
                  component="s"
                  sx={{ ...lineSx, color: "text.secondary" }}
                >
                  {changeValue(field, before)}
                </Typography>
                <Typography
                  component="span"
                  aria-hidden
                  sx={{ ...lineSx, color: "text.secondary", mx: 0.5 }}
                >
                  →
                </Typography>
              </>
            )}
            {after != null && (
              <Typography
                data-testid="change-after"
                component="span"
                sx={lineSx}
              >
                {field === "description" && before == null
                  ? "added"
                  : changeValue(field, after)}
              </Typography>
            )}
          </>
        )}
      </Typography>
    </Box>
  );
}

/** What a step changed: one line per field, the old value struck through. */
export default function HistoryChanges({
  changes,
}: {
  changes: HistoryChange[];
}) {
  if (changes.length === 0) return null;
  return (
    <Box sx={{ display: "grid", gap: 0.5, mt: 0.75 }}>
      {changes.map((change) => (
        <ChangeLine key={change.field} change={change} />
      ))}
    </Box>
  );
}
