import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import { apiErrorMessage } from "@/lib/api/client";
import {
  pushSupported,
  useNotificationState,
  usePushOnThisDevice,
  useSetPush,
} from "@/lib/hooks/useNotifications";
import { theme } from "@/lib/theme";

const { tokens } = theme;

/** Calm tokens and a 44px hit area; MUI's switch is 38px with black tracks. */
const switchSx = {
  width: 58,
  height: tokens.touch.min,
  p: "15px 12px",
  "& .MuiSwitch-switchBase": {
    p: "12px",
    "&.Mui-checked": { transform: "translateX(14px)" },
  },
  "& .MuiSwitch-thumb": {
    width: 20,
    height: 20,
    color: tokens.surfaceLowest,
    boxShadow: tokens.elevation.e1,
  },
  "& .MuiSwitch-switchBase + .MuiSwitch-track": {
    borderRadius: tokens.radii.pill,
    backgroundColor: tokens.outline,
    opacity: 1,
  },
  "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
    backgroundColor: tokens.primary,
    opacity: 1,
  },
  "& .MuiSwitch-switchBase.Mui-disabled + .MuiSwitch-track": { opacity: 0.5 },
} as const;

/** Push on this device: the phone buzzes when a trip's plans change, even
 * with the app closed. Per device, because each browser subscribes itself. */
export default function PushSettings() {
  const { data: state } = useNotificationState(true);
  const publicKey = state?.push_public_key ?? undefined;
  const supported = pushSupported(publicKey);
  const { data: on = false, isLoading } = usePushOnThisDevice(publicKey);
  const setPush = useSetPush(publicKey);

  const deviceState = supported
    ? on
      ? "On for this device"
      : "Off for this device"
    : publicKey
      ? "This browser cannot receive push notifications. On an iPhone, add Paddlemate to the home screen first."
      : "This server does not send push notifications.";

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Box
        component="label"
        data-testid="push-row"
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          minHeight: tokens.touch.row,
          cursor: supported ? "pointer" : "default",
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 600 }}>Trip changes</Typography>
          <Typography
            data-testid="push-hint"
            variant="body2"
            color="textSecondary"
          >
            Who joins or leaves, bases added, moved or decided, and when people
            arrive. Votes and edits only show under the bell.
          </Typography>
        </Box>
        {supported && (
          <Switch
            checked={on}
            sx={switchSx}
            disabled={isLoading || setPush.isPending}
            onChange={(_, checked) => setPush.mutate(checked)}
            slotProps={{ input: { "aria-label": "Push on this device" } }}
          />
        )}
      </Box>
      <Typography
        data-testid="push-device-state"
        variant="body2"
        color="textSecondary"
      >
        {deviceState}
      </Typography>
      {setPush.isError && (
        <Alert severity="error">
          {apiErrorMessage(setPush.error, setPush.error.message)}
        </Alert>
      )}
    </Box>
  );
}
