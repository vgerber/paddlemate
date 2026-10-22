import type { ReactNode } from "react";
import { InboxIcon } from "@/lib/icons";
import StateLayout from "./StateLayout";

/** Icon in a soft tile plus one line of text - the design language's empty
 * state. The FAB is the call to action, so no buttons here. */
export default function EmptyState({
  icon = <InboxIcon />,
  title,
  caption,
  py = 6,
  pt = py,
  pb = py,
}: {
  icon?: ReactNode;
  title: string;
  caption?: string;
  py?: number;
  /** Override the top or bottom of `py`. */
  pt?: number;
  pb?: number;
}) {
  return (
    <StateLayout
      data-testid="empty-state"
      icon={icon}
      title={title}
      caption={caption}
      py={py}
      pt={pt}
      pb={pb}
    />
  );
}
