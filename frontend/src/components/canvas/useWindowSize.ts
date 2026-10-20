import { useEffect, useState } from "react";
import type { Viewport } from "./canvasStore";

const read = (): Viewport => ({
  w: document.documentElement.clientWidth,
  h: window.innerHeight,
});

/** The window size without the scrollbar, updated at most once per frame
 * while it is being resized. */
export function useWindowSize(): Viewport {
  const [size, setSize] = useState(read);
  useEffect(() => {
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = read();
        setSize((prev) =>
          prev.w === next.w && prev.h === next.h ? prev : next,
        );
      });
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, []);
  return size;
}
