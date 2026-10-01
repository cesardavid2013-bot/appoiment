import { requireAdmin } from "@/server/authz";
import { readJson, route, zId } from "@/server/http";
import { staffReply, staffReplySchema } from "@/server/services/admin-support";

export const POST = route<{ id: string }>({ auth: true }, async ({ req, viewer, params }) => {
  requireAdmin(viewer, "support");
  return staffReply(viewer, zId.parse(params.id), await readJson(req, staffReplySchema));
});
