import type { GaugeMapState } from "@/lib/api";
import { theme } from "@/lib/theme";

const { tokens } = theme;

export const STATES: {
  key: GaugeMapState;
  label: string;
  color: string;
  help: string;
}[] = [
  {
    key: "used",
    label: "On a section",
    color: tokens.success,
    help: "Shows a run's water level",
  },
  {
    key: "fetched",
    label: "Tracked",
    color: tokens.gaugeTracked,
    help: "We collect its data, but no section uses it yet",
  },
  {
    key: "available",
    label: "Untracked",
    color: tokens.gaugeUntracked,
    help: "A known station we don't collect yet - can be added",
  },
];

export const stateMeta = (state: GaugeMapState) =>
  STATES.find((s) => s.key === state) ?? STATES[2];
