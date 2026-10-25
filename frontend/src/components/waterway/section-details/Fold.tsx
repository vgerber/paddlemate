import Box from "@mui/material/Box";
import type { SxProps, Theme } from "@mui/material/styles";
import type { ReactNode } from "react";
import {
  css,
  prefersReducedMotion,
  REDUCED_FADE_MS,
  useReducedMotion,
} from "@/lib/motion";

/** A body that folds by grid rows (1fr to 0fr): the content fades first when
 * it closes and last when it opens, so the edge moves before the rows do.
 * Reduced: the height snaps once the fade is done, the content cross-fades.
 * Folded content is `visibility: hidden`, so it leaves the tab order. */
export function Fold({
  open,
  children,
  sx,
}: {
  open: boolean;
  children: ReactNode;
  sx?: SxProps<Theme>;
}) {
  const reduced = useReducedMotion();
  const fade = reduced ? `${REDUCED_FADE_MS}ms` : css.fast;
  const height = reduced
    ? `0ms linear ${open ? "0ms" : fade}`
    : `${css.base} ${css.easeInOut}`;
  const wait = open ? (reduced ? "0ms" : css.instant) : "0ms";
  const hideAfter = reduced ? fade : css.base;
  return (
    <Box
      data-fold={open ? "open" : "shut"}
      data-reduced-fade
      sx={{
        display: "grid",
        gridTemplateRows: open ? "1fr" : "0fr",
        minHeight: 0,
        transition: `grid-template-rows ${height}`,
        willChange: "grid-template-rows",
      }}
    >
      <Box
        data-fold-body
        data-reduced-fade
        sx={[
          {
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            overflow: "hidden",
            opacity: open ? 1 : 0,
            visibility: open ? "visible" : "hidden",
            transition: `opacity ${fade} ${css.easeOut} ${wait}, visibility 0s linear ${open ? "0ms" : hideAfter}`,
          },
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
      >
        {children}
      </Box>
    </Box>
  );
}

/** The selection fade: fast, or the short reduced cross-fade. The element
 * also sets `data-reduced-fade`, or the global reduced rule cuts it to 1 ms. */
export function selectionFade(properties: string[]): string {
  const time = prefersReducedMotion() ? `${REDUCED_FADE_MS}ms` : css.fast;
  return properties.map((p) => `${p} ${time} ${css.easeOut}`).join(", ");
}
