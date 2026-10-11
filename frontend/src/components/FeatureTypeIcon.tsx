import type { FeatureType } from "@/lib/api";

/** Path data of the feature type icons, from
 * doc/plans/ui-overhaul/feature-icons.svg: one 24px grid, 2px stroke. The
 * Record type makes a new FeatureType fail to compile until it has a drawing. */
export const FEATURE_ICON_PATHS: Record<FeatureType, string[]> = {
  whitewater: [
    "M3 7c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0",
    "M3 12c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0",
    "M3 17c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0",
  ],
  rapid: [
    "M3 19h18",
    "M4 19c1-6 4.5-11 10-11 3 0 5 1.8 5 4.2 0 2-1.6 3.3-3.4 3.3-1.6 0-2.6-1-2.6-2.4",
  ],
  freestyle_spot: [
    "M3 13.5c3-2 6-3 9-3s6 1 9 3c-3 1.2-6 1.8-9 1.8s-6-.6-9-1.8z",
    "M3 19c1.5-1.2 3-1.2 4.5 0s3 1.2 4.5 0 3-1.2 4.5 0 3 1.2 4.5 0",
    "M12 7V4",
  ],
  hole: ["M18.5 12a6.5 6.5 0 1 1-2.2-4.9", "M17 3.5l.3 3.8-3.7.4"],
  siphon: ["M4 11 8 5h8l4 6z", "M12 13v6", "M9 16.5l3 3 3-3"],
  strainer: [
    "M12 21V10",
    "M12 14l-4-4M12 12l4.5-4.5M8 10V6.5M16.5 7.5H20",
    "M4 21h16",
  ],
  weir: ["M3 8h8v9h10", "M11 8c2.6 0 3.6 3.4 3.6 7"],
  dam: ["M5 5h14v15H5z", "M5 10h14M5 15h14M12 5v5M9 10v5M15 10v5M12 15v5"],
  obstacle: ["M5 17c-.4-4.6 2.6-9 7-9s7.4 4.4 7 9z", "M3 20h18"],
  bridge: ["M2 8h20", "M5 8v9M19 8v9", "M5 17c0-4 3.1-6 7-6s7 2 7 6"],
  portage: [
    "M7.5 10.5c-1.6 0-2.5-1.6-2.5-3.5S5.9 3.5 7.5 3.5 10 5.1 10 7s-.9 3.5-2.5 3.5z",
    "M6 13.5h3",
    "M16.5 20.5c-1.6 0-2.5-1.6-2.5-3.5s.9-3.5 2.5-3.5S19 15.1 19 17s-.9 3.5-2.5 3.5z",
    "M15 10.5h3",
  ],
  put_in: ["M12 3v11M7.5 9.5 12 14l4.5-4.5", "M4 19.5h16"],
  take_out: ["M12 15V4M7.5 8.5 12 4l4.5 4.5", "M4 19.5h16"],
  waterfall: [
    "M3 5h11",
    "M14 5v15M10.5 5v10M17.5 8v12",
    "M14 5c1.8 0 3.5 1.2 3.5 3",
  ],
};

export type FeatureIconSize = 16 | 20 | 24;

/** The icon of a feature type. It always sits beside the name, so it is
 * hidden from assistive tech unless a `title` is given. Colour is the text
 * colour of the parent. */
export default function FeatureTypeIcon({
  type,
  size = 20,
  title,
}: {
  type: FeatureType;
  size?: FeatureIconSize;
  title?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      aria-label={title}
      focusable="false"
      style={{ flexShrink: 0 }}
    >
      {FEATURE_ICON_PATHS[type].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
