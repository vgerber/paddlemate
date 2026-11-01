import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { factLabelSx, factValueSx } from "@/components/Fact";
import { withAlpha } from "@/lib/theme/alpha";
import { theme } from "@/lib/theme/theme";

const { tokens } = theme;

/** One labelled value of an entry's overview. A second quieter line sits
 * under its own value, so a date or source never drifts to another column. */
export interface OverviewRow {
  label: string;
  value: ReactNode;
  caption?: ReactNode;
  testId?: string;
}

/** The overview as aligned label and value rows, a dimmed rule between
 * them. */
export default function OverviewRows({ rows }: { rows: OverviewRow[] }) {
  return (
    <Box data-testid="overview">
      {rows.map((row) => (
        <Box
          key={row.label}
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "minmax(88px, 32%) minmax(0, 1fr)",
              md: "160px minmax(0, 1fr)",
            },
            columnGap: 2,
            alignItems: "baseline",
            py: 1,
            minHeight: tokens.touch.min,
            "&:not(:last-child)": {
              borderBottom: `1px solid ${withAlpha(tokens.outlineVariant, "hairline")}`,
            },
          }}
        >
          <Typography data-testid="fact-label" sx={factLabelSx}>
            {row.label}
          </Typography>
          <Box data-testid={row.testId} sx={{ minWidth: 0 }}>
            <Typography
              component="div"
              sx={{ ...factValueSx, overflowWrap: "anywhere" }}
            >
              {row.value}
            </Typography>
            {row.caption && (
              <Typography
                component="div"
                sx={{
                  ...factLabelSx,
                  fontWeight: 400,
                  fontSize: "0.8125rem",
                  overflowWrap: "anywhere",
                }}
              >
                {row.caption}
              </Typography>
            )}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
