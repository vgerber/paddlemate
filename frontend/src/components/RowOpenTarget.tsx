import ButtonBase, { type ButtonBaseProps } from "@mui/material/ButtonBase";
import { focusRingSx } from "@/lib/theme/focusRing";
import { theme } from "@/lib/theme/theme";

const { tokens } = theme;

const HANG = {
  flex: 1,
  minWidth: 0,
  alignSelf: "stretch",
  justifyContent: "flex-start",
  textAlign: "left",
  // Hangs out over the row's padding so the whole row opens it.
  my: -1,
  py: 1.75,
  ml: `-${tokens.phone.inner}px`,
  pl: `${tokens.phone.inner}px`,
  borderRadius: `${tokens.radii.md}px`,
  ...focusRingSx(-2),
} as const;

const PLAIN = {
  textAlign: "left",
  ...focusRingSx(2),
} as const;

/** The clickable area of a row. `hang` stretches it over the row's padding
 * (for a row with a sibling control, such as a checkbox, that cannot sit
 * inside a button); without it the target is the row itself. Either way it
 * carries the focus ring. */
export default function RowOpenTarget({
  hang,
  sx,
  ...props
}: ButtonBaseProps & { hang?: boolean }) {
  return (
    <ButtonBase
      {...props}
      sx={[hang ? HANG : PLAIN, ...(Array.isArray(sx) ? sx : [sx])]}
    />
  );
}
