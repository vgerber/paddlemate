import { useRouter } from "@tanstack/react-router";
import { useCallback } from "react";

/** One way back: the previous entry when the app has one, else `fallback`.
 * A bare history.back() leaves the app when the page was a deep link. */
export function useGoBack(fallback: () => void) {
  const router = useRouter();
  return useCallback(() => {
    if (window.history.length > 1) router.history.back();
    else fallback();
  }, [router, fallback]);
}
