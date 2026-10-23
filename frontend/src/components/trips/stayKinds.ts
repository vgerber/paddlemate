import type { TripStayKind } from "@/lib/api";
import {
  BivouacIcon,
  HolidayHomeIcon,
  HotelIcon,
  PlaceIcon,
  type SvgIconComponent,
} from "@/lib/icons";
import { TentIcon } from "./TripIcons";

interface StayKind {
  value: TripStayKind;
  label: string;
  Icon: SvgIconComponent;
}

/** Where anything the list does not name lands, and the fallback for a kind
 * this build does not know yet. */
const OTHER: StayKind = {
  value: "other",
  label: "Other",
  Icon: PlaceIcon,
};

export const STAY_KINDS: StayKind[] = [
  { value: "camp", label: "Camp", Icon: TentIcon },
  { value: "hotel", label: "Hotel", Icon: HotelIcon },
  { value: "bivouac", label: "Bivouac", Icon: BivouacIcon },
  // Ferienhaus, holiday let, Airbnb - a whole place the group rents.
  { value: "holiday_home", label: "Holiday home", Icon: HolidayHomeIcon },
  OTHER,
];

export function stayKind(kind: TripStayKind): StayKind {
  return STAY_KINDS.find((k) => k.value === kind) ?? OTHER;
}
