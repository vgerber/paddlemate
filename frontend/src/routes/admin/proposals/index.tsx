import { createFileRoute, redirect } from "@tanstack/react-router";

/** The admin proposals page was merged into /proposals (review tools show for
 * admins there). Kept as a redirect for old links/bookmarks. */
export const Route = createFileRoute("/admin/proposals/")({
  beforeLoad: () => {
    throw redirect({
      to: "/proposals",
      search: {
        status: "pending",
        entity_type: undefined,
        operation: undefined,
        selected: undefined,
      },
    });
  },
});
