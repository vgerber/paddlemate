import type { ReactNode } from "react";
import { theme } from "@/lib/theme";

const { tokens } = theme;

/** A transparent touch-sized box around a small marker, so the marker keeps
 * its look and the element MapLibre exposes as a button is a full target. */
export default function MarkerHit({
  children,
  title,
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <div
      title={title}
      style={{
        width: tokens.touch.min,
        height: tokens.touch.min,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      {children}
    </div>
  );
}
