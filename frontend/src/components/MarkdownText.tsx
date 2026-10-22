import Typography from "@mui/material/Typography";
import { lazy, Suspense } from "react";

// The markdown pipeline is ~100 kB and only trip and note text uses it.
const MarkdownRender = lazy(() => import("./MarkdownRender"));

/** Somebody's text, formatted as markdown (see `MarkdownRender`). The raw
 * text shows in the same type while the renderer loads. */
export default function MarkdownText({ children }: { children: string }) {
  return (
    <Suspense
      fallback={
        <Typography
          variant="body2"
          color="textSecondary"
          sx={{ mb: 0.5, whiteSpace: "pre-wrap" }}
        >
          {children}
        </Typography>
      }
    >
      <MarkdownRender>{children}</MarkdownRender>
    </Suspense>
  );
}
