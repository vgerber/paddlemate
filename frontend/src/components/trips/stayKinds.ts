import type { SvgIconComponent } from "@mui/icons-material";
import CabinOutlinedIcon from "@mui/icons-material/CabinOutlined";
import HotelOutlinedIcon from "@mui/icons-material/HotelOutlined";
import NightShelterOutlinedIcon from "@mui/icons-material/NightShelterOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import type { TripStayKind } from "@/lib/api";

export const STAY_KINDS: {
  value: TripStayKind;
  label: string;
  Icon: SvgIconComponent;
}[] = [
  { value: "camp", label: "Camp", Icon: CabinOutlinedIcon },
  { value: "hotel", label: "Hotel", Icon: HotelOutlinedIcon },
  { value: "bivouac", label: "Bivouac", Icon: NightShelterOutlinedIcon },
  { value: "other", label: "Other", Icon: PlaceOutlinedIcon },
];

export function stayKind(kind: TripStayKind) {
  return STAY_KINDS.find((k) => k.value === kind) ?? STAY_KINDS[3];
}
