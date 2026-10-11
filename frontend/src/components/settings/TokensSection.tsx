import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import EmptyState from "@/components/states/EmptyState";
import LoadingBox from "@/components/states/LoadingBox";
import FormSection from "@/components/waterway/FormSection";
import type { ApiToken, ApiTokenCreated } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api/client";
import {
  useApiTokens,
  useCreateApiToken,
  useRevokeApiToken,
} from "@/lib/hooks/useApiTokens";
import { theme } from "@/lib/theme";
import NewTokenCard from "./NewTokenCard";
import TokenRow from "./TokenRow";

const { tokens } = theme;

export default function TokensSection() {
  const [name, setName] = useState("");
  const [created, setCreated] = useState<ApiTokenCreated | null>(null);
  // Token queued for revocation; drives the confirm dialog.
  const [revokeTarget, setRevokeTarget] = useState<ApiToken | null>(null);

  const { data: list, isLoading } = useApiTokens();
  const create = useCreateApiToken();
  const revoke = useRevokeApiToken();

  const submit = () => {
    if (!name.trim() || create.isPending) return;
    create.mutate(name.trim(), {
      onSuccess: (token) => {
        setCreated(token);
        setName("");
      },
    });
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <FormSection
        label="New token"
        hint="For scripts and the API. A token is shown once, when you make it."
      >
        <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
          <TextField
            label="Token name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            size="small"
            sx={{
              flex: 1,
              maxWidth: 360,
              "& .MuiOutlinedInput-root": { minHeight: tokens.touch.min },
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
          <Button
            variant="contained"
            disabled={!name.trim() || create.isPending}
            onClick={submit}
            sx={{
              minHeight: tokens.touch.min,
              "&.Mui-disabled": {
                bgcolor: tokens.outlineVariant,
                color: tokens.outline,
              },
            }}
          >
            Create
          </Button>
        </Box>
        {create.isError && (
          <Alert severity="error">
            {apiErrorMessage(create.error, "Failed to create token")}
          </Alert>
        )}
        {created && (
          <NewTokenCard token={created.token} onDone={() => setCreated(null)} />
        )}
      </FormSection>

      <Box>
        <Typography sx={{ fontWeight: 600, fontSize: "0.9375rem", mb: 0.5 }}>
          Your tokens
        </Typography>
        {isLoading ? (
          <LoadingBox size={28} pt={2} />
        ) : list?.length === 0 ? (
          <EmptyState title="No tokens yet." py={4} />
        ) : (
          list?.map((token) => (
            <TokenRow
              key={token.id}
              token={token}
              onRevoke={() => setRevokeTarget(token)}
            />
          ))
        )}
      </Box>

      <ConfirmDialog
        open={revokeTarget !== null}
        title="Revoke token?"
        body={`"${revokeTarget?.name ?? ""}" stops working immediately and cannot be restored.`}
        confirmLabel="Revoke"
        pendingLabel="Revoking…"
        color="error"
        pending={revoke.isPending}
        onCancel={() => setRevokeTarget(null)}
        onConfirm={() => {
          if (!revokeTarget) return;
          revoke.mutate(revokeTarget.id, {
            onSuccess: () => setRevokeTarget(null),
          });
        }}
      />
    </Box>
  );
}
