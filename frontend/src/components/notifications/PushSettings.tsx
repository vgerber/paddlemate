import Alert from "@mui/material/Alert";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import FormSection from "@/components/waterway/FormSection";
import { apiErrorMessage } from "@/lib/api/client";
import {
  pushSupported,
  useNotificationState,
  usePushOnThisDevice,
  useSetPush,
} from "@/lib/hooks/useNotifications";

/** Push on this device: the phone buzzes when a trip's plans change, even
 * with the app closed. Per device, because each browser subscribes itself. */
export default function PushSettings() {
  const { data: state } = useNotificationState(true);
  const publicKey = state?.push_public_key ?? undefined;
  const supported = pushSupported(publicKey);
  const { data: on = false, isLoading } = usePushOnThisDevice(publicKey);
  const setPush = useSetPush(publicKey);

  return (
    <FormSection
      label="Notifications"
      hint="Who joins or leaves, bases added, moved or decided, and when people arrive. Votes and edits only show under the bell."
    >
      {!supported ? (
        <Typography variant="body2" color="text.secondary">
          {publicKey
            ? "This browser cannot receive push notifications. On an iPhone, add Paddlemate to the home screen first."
            : "This server does not send push notifications."}
        </Typography>
      ) : (
        <FormControlLabel
          control={
            <Switch
              checked={on}
              disabled={isLoading || setPush.isPending}
              onChange={(_, checked) => setPush.mutate(checked)}
            />
          }
          label="Push notifications on this device"
        />
      )}
      {setPush.isError && (
        <Alert severity="error">
          {apiErrorMessage(setPush.error, setPush.error.message)}
        </Alert>
      )}
    </FormSection>
  );
}
