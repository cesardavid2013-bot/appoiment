import { requireAdmin } from "@/server/authz";
import { readJson, route, zId } from "@/server/http";
import { setTicketStatus, ticketStatusSchema } from "@/server/services/admin-support";

export const POST = route<{ id: string }>({ auth: true }, async ({ req, viewer, params }) => {
  requireAdmin(viewer, "support");
  const { status } = await readJson(req, ticketStatusSchema);
  return setTicketStatus(viewer, zId.parse(params.id), status);
});
