import type { GaugeMapState } from "@/lib/api";
import type { ResolvedTokens } from "@/lib/useTokens";

export interface GaugeStateMeta {
  key: GaugeMapState;
  label: string;
  color: string;
  help: string;
}

/** The three gauge states with their colours for the active scheme. */
export const gaugeStates = (tokens: ResolvedTokens): GaugeStateMeta[] => [
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

export const stateMeta = (states: GaugeStateMeta[], state: GaugeMapState) =>
  states.find((s) => s.key === state) ?? states[2];
