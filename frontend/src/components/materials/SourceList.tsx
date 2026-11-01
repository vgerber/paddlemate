import Box from "@mui/material/Box";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import Typography from "@mui/material/Typography";
import { OpenExternalIcon } from "@/lib/icons";
import { withAlpha } from "@/lib/theme/alpha";
import { theme } from "@/lib/theme/theme";

const { tokens } = theme;

/** One place the entry's numbers came from, or the maker's own page. */
export interface SourceLink {
  url: string;
  /** What the link is: a host, or "Manufacturer page". */
  title: string;
  /** What it states, after the title. */
  detail?: string;
}

/** Outbound links as rows with a dimmed rule between them and the
 * external-link mark at the right. */
export default function SourceList({ links }: { links: SourceLink[] }) {
  return (
    <List disablePadding>
      {links.map((link) => (
        <ListItem disablePadding key={link.url}>
          <ListItemButton
            component="a"
            href={link.url}
            target="_blank"
            rel="noreferrer noopener"
            sx={{
              gap: 1,
              minHeight: tokens.touch.min,
              px: 0,
              overflowWrap: "anywhere",
              "&:not(:last-child)": {
                borderBottom: `1px solid ${withAlpha(tokens.outlineVariant, "hairline")}`,
              },
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0, color: tokens.primary }}>
              {link.title}
              {link.detail && (
                <Typography
                  variant="body2"
                  color="textSecondary"
                  component="span"
                >
                  {` - ${link.detail}`}
                </Typography>
              )}
            </Box>
            <OpenExternalIcon
              sx={{ fontSize: 16, flexShrink: 0, color: "text.secondary" }}
            />
          </ListItemButton>
        </ListItem>
      ))}
    </List>
  );
}
