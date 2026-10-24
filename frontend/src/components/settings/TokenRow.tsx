import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import RowMenu from "@/components/RowMenu";
import { withAlpha } from "@/lib/alpha";
import type { ApiToken } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { DeleteIcon } from "@/lib/icons";
import { theme } from "@/lib/theme";

const { tokens } = theme;

/** One token: name, when it was last used and expires, and a row menu. */
export default function TokenRow({
  token,
  onRevoke,
}: {
  token: ApiToken;
  onRevoke: () => void;
}) {
  const lastUsed = token.last_used_at
    ? formatDate(token.last_used_at)
    : "never";
  const expires = token.expires_at ? formatDate(token.expires_at) : "never";

  return (
    <Box
      data-testid="token-row"
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        minHeight: tokens.touch.row,
        py: 0.5,
        borderBottom: "1px solid",
        borderColor: withAlpha(tokens.outlineVariant, "hairline"),
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600, wordBreak: "break-word" }}>
          {token.name}
        </Typography>
        <Typography
          color="textSecondary"
          sx={{ fontSize: "0.8125rem", lineHeight: "18px" }}
        >
          {token.is_active ? "Active" : "Expired"} · Last used: {lastUsed} ·
          Expires: {expires}
        </Typography>
      </Box>
      <RowMenu
        label="Token actions"
        actions={[
          {
            label: "Revoke",
            icon: <DeleteIcon />,
            danger: true,
            onClick: onRevoke,
          },
        ]}
      />
    </Box>
  );
}
