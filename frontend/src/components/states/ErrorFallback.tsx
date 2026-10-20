import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlineOutlined";
import Button from "@mui/material/Button";
import { apiErrorMessage } from "@/lib/api/client";
import StateCard from "./StateCard";

/** Route-level error boundary screen: shown instead of a blank page when a
 * route component throws. Wired as the router's defaultErrorComponent. */
export default function ErrorFallback({ error }: { error: unknown }) {
  return (
    <StateCard
      icon={<ErrorOutlineIcon />}
      title="Something went wrong"
      caption={apiErrorMessage(error, "An unexpected error occurred.")}
    >
      <Button variant="contained" onClick={() => window.location.reload()}>
        Reload
      </Button>
    </StateCard>
  );
}
