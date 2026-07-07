import { createFileRoute, useNavigate } from "@tanstack/react-router";
import ProposalsView from "@/components/proposals/ProposalsView";
import type {
  ProposalEntityType,
  ProposalOperation,
  ProposalStatus,
} from "@/lib/api";
import { useSession } from "@/lib/hooks/useSession";

export const Route = createFileRoute("/proposals/")({
  validateSearch: (search: Record<string, unknown>) => ({
    status:
      search.status === "pending" ||
      search.status === "approved" ||
      search.status === "rejected"
        ? (search.status as ProposalStatus)
        : ("pending" as ProposalStatus),
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
  // Review tools are shown inline for admins — there is no separate admin page.
  const { isAdmin } = useSession();

  return (
    <ProposalsView
      adminMode={isAdmin}
      status={status}
      entityType={entity_type}
      operation={operation}
      onStatusChange={(s) =>
        navigate({ search: (prev) => ({ ...prev, status: s }) })
      }
      onEntityTypeChange={(t) =>
        navigate({ search: (prev) => ({ ...prev, entity_type: t }) })
      }
      onOperationChange={(o) =>
        navigate({ search: (prev) => ({ ...prev, operation: o }) })
      }
    />
  );
}
