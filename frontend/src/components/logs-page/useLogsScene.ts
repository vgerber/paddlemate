import { useMemo } from "react";
import type { MapScene } from "@/components/canvas/scene";
import { useDescent, useMyDescents } from "@/lib/hooks/useDescents";
import { buildLogsScene } from "./logsScene";

/** The logs map for the open log (if any); the scene keeps its identity until
 * a log changes, so the map is not redrawn by unrelated renders. */
export function useLogsScene(
  openId: number | undefined,
  enabled: boolean,
): MapScene {
  const { data: mine } = useMyDescents({}, enabled);
  const { data: open } = useDescent(openId ?? null);
  const items = mine?.items;
  return useMemo(
    () => buildLogsScene(open, items ?? [], openId),
    [open, items, openId],
  );
}
