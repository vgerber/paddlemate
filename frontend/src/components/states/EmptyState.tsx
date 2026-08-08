import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";

/** Icon plus one line of text - the design language's empty state. The FAB
 * is the call to action, so no buttons here. */
export default function EmptyState({
  icon,
  title,
  caption,
  py = 6,
}: {
  icon?: ReactNode;
  title: string;
  caption?: string;
  py?: number;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1,
        py,
        px: 2,
        textAlign: "center",
      }}
    >
      {icon}
      <Typography variant="body2" color="text.secondary">
        {title}
      </Typography>
      {caption && (
        <Typography variant="caption" color="text.disabled">
          {caption}
        </Typography>
      )}
    </Box>
  );
}
