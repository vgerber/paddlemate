import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import ProposalCard from "@/components/waterway/ProposalCard";
import type { ProposalEntityType, ProposalOperation } from "@/lib/api";
import { useProposals } from "@/lib/hooks/useProposals";

export const Route = createFileRoute("/proposals/")({
  validateSearch: (search: Record<string, unknown>) => ({
    status:
      search.status === "pending" ||
      search.status === "approved" ||
      search.status === "rejected"
        ? (search.status as string)
        : "pending",
    entity_type:
      typeof search.entity_type === "string"
        ? (search.entity_type as ProposalEntityType)
        : undefined,
    operation:
      typeof search.operation === "string"
        ? (search.operation as ProposalOperation)
        : undefined,
  }),
  component: ProposalsPage,
});

function ProposalsPage() {
  const navigate = useNavigate({ from: "/proposals/" });
  const { status, entity_type, operation } = Route.useSearch();

  const { data: proposals, isLoading } = useProposals({
    status: status || undefined,
    entity_type: entity_type || undefined,
    operation: operation || undefined,
  });

  const statusTabs = ["pending", "approved", "rejected"] as const;

  return (
    <Box
      sx={{
        maxWidth: 800,
        mx: "auto",
        px: 2,
        py: 3,
      }}
    >
      <Tabs
        value={status ?? "pending"}
        onChange={(_, v) =>
          navigate({ search: (prev) => ({ ...prev, status: v }) })
        }
        sx={{ mb: 2 }}
      >
        {statusTabs.map((s) => (
          <Tab
            key={s}
            label={s.charAt(0).toUpperCase() + s.slice(1)}
            value={s}
          />
        ))}
      </Tabs>

      <Box sx={{ display: "flex", gap: 1.5, mb: 2, flexWrap: "wrap" }}>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel id="entity-type-label">Entity type</InputLabel>
          <Select
            labelId="entity-type-label"
            label="Entity type"
            value={entity_type ?? ""}
            onChange={(e) =>
              navigate({
                search: (prev) => ({
                  ...prev,
                  entity_type:
                    (e.target.value as ProposalEntityType) || undefined,
                }),
              })
            }
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="waterway">River</MenuItem>
            <MenuItem value="water_section">Section</MenuItem>
            <MenuItem value="feature">Feature</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel id="operation-label">Operation</InputLabel>
          <Select
            labelId="operation-label"
            label="Operation"
            value={operation ?? ""}
            onChange={(e) =>
              navigate({
                search: (prev) => ({
                  ...prev,
                  operation: (e.target.value as ProposalOperation) || undefined,
                }),
              })
            }
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="create">Create</MenuItem>
            <MenuItem value="update">Update</MenuItem>
            <MenuItem value="delete">Delete</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : !proposals || proposals.length === 0 ? (
        <Typography color="text.secondary">No proposals found.</Typography>
      ) : (
        proposals.map((p) => <ProposalCard key={p.id} proposal={p} />)
      )}
    </Box>
  );
}
