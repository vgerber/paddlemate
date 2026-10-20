import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Fact from "@/components/Fact";
import { ACCOUNT_CONSOLE_URL } from "@/lib/auth";
import { useSession } from "@/lib/hooks/useSession";
import { fonts, theme } from "@/lib/theme";

const { tokens } = theme;

/** Read-only facts, not fields: a disabled input stretched across a desktop
 * column only looks like something you may edit. */
export default function AccountSection() {
  const { user, logout } = useSession();

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {/* gap, not Stack spacing: a wrapped item would keep the left margin
          and sit indented under the first. */}
      <Box sx={{ display: "flex", flexWrap: "wrap", columnGap: 5, rowGap: 2 }}>
        <Fact label="Username" value={user?.username ?? "-"} />
        <Fact
          label="User ID"
          value={
            <Box
              component="span"
              sx={{
                fontFamily: fonts.body,
                fontSize: "0.875rem",
                fontWeight: 500,
                wordBreak: "break-all",
              }}
            >
              {user?.id ?? "-"}
            </Box>
          }
        />
      </Box>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5 }}>
        <Button
          variant="outlined"
          component="a"
          href={ACCOUNT_CONSOLE_URL}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ minHeight: tokens.touch.min }}
        >
          Account settings
        </Button>
        <Button
          variant="outlined"
          color="error"
          onClick={logout}
          sx={{ minHeight: tokens.touch.min, color: tokens.error }}
        >
          Sign out
        </Button>
      </Box>
    </Box>
  );
}
