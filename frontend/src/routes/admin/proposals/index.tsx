import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import ProposalCard from "@/components/waterway/ProposalCard";
import { useProposals } from "@/lib/hooks/useProposals";
import { useSession } from "@/lib/hooks/useSession";

export const Route = createFileRoute("/admin/proposals/")({
  validateSearch: (search: Record<string, unknown>) => ({
    status:
      search.status === "pending" ||
      search.status === "approved" ||
      search.status === "rejected"
        ? (search.status as string)
        : "pending",
    entity_type:
      search.entity_type === "waterway" ||
      search.entity_type === "water_section" ||
      search.entity_type === "feature"
        ? (search.entity_type as string)
        : undefined,
  }),
  component: AdminProposalsPage,
});

function AdminProposalsPage() {
  const { isAdmin, isLoading } = useSession();
  const navigate = useNavigate({ from: "/admin/proposals/" });
  const { status, entity_type } = Route.useSearch();

  const { data: proposals, isLoading: proposalsLoading } = useProposals(
    isAdmin
      ? { status: status || undefined, entity_type: entity_type || undefined }
      : {},
  );

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!isAdmin) {
    navigate({
      to: "/",
      search: {
        waterway: undefined,
        section: undefined,
        q: undefined,
        country: undefined,
        min_diff: undefined,
        max_diff: undefined,
        mode: undefined,
        lat: undefined,
        lon: undefined,
        radius: undefined,
      },
    });
    return null;
  }

  const entityTabs = [
    { value: "", label: "All" },
    { value: "waterway", label: "Rivers" },
    { value: "water_section", label: "Sections" },
    { value: "feature", label: "Features" },
  ] as const;

  const statusTabs = ["pending", "approved", "rejected"] as const;

  return (
    <Box sx={{ maxWidth: 900, mx: "auto", px: 2, py: 3 }}>
      <Typography variant="h5" sx={{ mb: 2, fontWeight: 700 }}>
        Admin — Proposals
      </Typography>

      <Tabs
        value={status ?? "pending"}
        onChange={(_, v) =>
          navigate({ search: (prev) => ({ ...prev, status: v }) })
        }
        sx={{ mb: 1.5 }}
      >
        {statusTabs.map((s) => (
          <Tab
            key={s}
            label={s.charAt(0).toUpperCase() + s.slice(1)}
            value={s}
          />
        ))}
      </Tabs>

      <Tabs
        value={entity_type ?? ""}
        onChange={(_, v) =>
          navigate({
            search: (prev) => ({ ...prev, entity_type: v || undefined }),
          })
        }
        sx={{ mb: 2 }}
      >
        {entityTabs.map((t) => (
          <Tab key={t.label} label={t.label} value={t.value} />
        ))}
      </Tabs>

      {proposalsLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : !proposals || proposals.length === 0 ? (
        <Typography color="text.secondary">No proposals found.</Typography>
      ) : (
        proposals.map((p) => <ProposalCard key={p.id} proposal={p} adminMode />)
      )}
    </Box>
  );
}
