import type { SvgIconComponent } from "@mui/icons-material";
import CabinOutlinedIcon from "@mui/icons-material/CabinOutlined";
import CottageOutlinedIcon from "@mui/icons-material/CottageOutlined";
import HotelOutlinedIcon from "@mui/icons-material/HotelOutlined";
import NightShelterOutlinedIcon from "@mui/icons-material/NightShelterOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import type { TripStayKind } from "@/lib/api";

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
  Icon: PlaceOutlinedIcon,
};

export const STAY_KINDS: StayKind[] = [
  { value: "camp", label: "Camp", Icon: CabinOutlinedIcon },
  { value: "hotel", label: "Hotel", Icon: HotelOutlinedIcon },
  { value: "bivouac", label: "Bivouac", Icon: NightShelterOutlinedIcon },
  // Ferienhaus, holiday let, Airbnb - a whole place the group rents.
  { value: "holiday_home", label: "Holiday home", Icon: CottageOutlinedIcon },
  OTHER,
];

export function stayKind(kind: TripStayKind): StayKind {
  return STAY_KINDS.find((k) => k.value === kind) ?? OTHER;
}
