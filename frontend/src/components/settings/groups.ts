/** The settings sections, in the order the list shows them. Adding one is a
 * row here plus a case in `SettingsSection`. */
export const GROUPS = [
  { id: "account", label: "Account", hint: "Who you are signed in as" },
  { id: "language", label: "Display language", hint: "Which names are shown" },
  {
    id: "appearance",
    label: "Appearance",
    hint: "Light, dark or follow the device",
  },
  {
    id: "units",
    label: "Units",
    hint: "Weight, distance and length",
  },
  {
    id: "notifications",
    label: "Notifications",
    hint: "Push when trip plans change",
  },
  { id: "tokens", label: "Access tokens", hint: "For scripts and the API" },
] as const;

/** The sections kept on the device, not on the account: a visitor who is not
 * signed in has these and only these. */
const DEVICE_GROUPS: readonly string[] = ["appearance", "units"];

export const groupsFor = (signedIn: boolean) =>
  signedIn ? GROUPS : GROUPS.filter((g) => DEVICE_GROUPS.includes(g.id));

export type GroupId = (typeof GROUPS)[number]["id"];

export const isGroupId = (v: unknown): v is GroupId =>
  GROUPS.some((g) => g.id === v);

/** The section a settings address names, or undefined for the list. */
export const parseGroup = (v: unknown): GroupId | undefined =>
  isGroupId(v) ? v : undefined;

export const groupLabel = (id: GroupId): string =>
  GROUPS.find((g) => g.id === id)?.label ?? id;
